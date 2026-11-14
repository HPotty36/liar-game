// 브라우저 없이 게임 흐름을 끝까지 돌려 보는 테스트.
// 실행: node tests/flow.test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const js = html.match(/<script>([\s\S]*)<\/script>/)[1];
const KEY = 'liar-party-v1';

let H = {};
const store = {};
const app = { innerHTML: '', scrollTop: 0, addEventListener: (t, f) => (H[t] = f), querySelector: () => null };
const el = { classList: { toggle() {} }, dataset: { ready: '' }, setPointerCapture() {} };
const root = { attrs: {}, getAttribute(k) { return this.attrs[k] || null; }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } };
global.document = { documentElement: root, getElementById: (id) => (id === 'app' ? app : el), addEventListener() {} };
global.window = { __noGuard: true };
global.navigator = {};
global.localStorage = { getItem: (k) => store[k] || null, setItem: (k, v) => (store[k] = v) };
global.setInterval = () => 0;
global.clearInterval = () => {};

const boot = () => { H = {}; (0, eval)(js); };
const has = (a) => app.innerHTML.includes('data-a="' + a + '"');
const click = (a, ds = {}) => {
  assert(has(a), `"${a}" 버튼이 화면에 없음`);
  H.click({ target: { closest: () => ({ dataset: { a, ...ds }, disabled: false }) } });
};
const round = () => JSON.parse(store[KEY]).round.R;
const heading = () => app.innerHTML.match(/<h1[^>]*>([^<]+)/)[1];

function play({ set = {}, add = 0, liars = 0, spies = 0, target, right = false }) {
  for (const [k, v] of Object.entries(set)) click('set', { k, v: String(v) });
  for (let i = 0; i < add; i++) click('pc', { d: '1' });
  for (let i = 0; i < Math.abs(spies); i++) click('spies', { d: spies > 0 ? '1' : '-1' });
  for (let i = 0; i < liars; i++) click('liars', { d: '1' });
  click('start');
  const n = +app.innerHTML.match(/카드 확인 1\/(\d+)/)[1];

  click('next-reveal');
  assert(app.innerHTML.includes('카드 확인 1/'), '카드를 안 봤는데 다음으로 넘어감');
  for (let i = 0; i < n; i++) {
    H.pointerdown({ target: { closest: () => el }, preventDefault() {}, pointerId: 1 });
    H.pointerup({});
    click('next-reveal');
  }
  click('begin');
  const roles = round().roles;
  while (has('next-speak')) click('next-speak');
  if (has('to-vote')) click('to-vote');

  const pick = target(roles);
  const vote = () => {
    for (let i = 0; i < n; i++) {
      click('open-vote');
      const opts = [...app.innerHTML.matchAll(/data-a="pick" data-j="(\d+)"/g)].map((m) => m[1]);
      assert(opts.length > 0, '고를 사람이 없음');
      assert(!opts.includes(String(i)), '자기 자신에게 투표할 수 있음');
      const t = String(pick(i));
      click('pick', { j: opts.includes(t) ? t : opts[0] });
      click('cast');
    }
  };
  vote();
  if (has('revote')) { click('revote'); vote(); }
  if (has('no-accuse')) click('no-accuse');
  else {
    click('unmask');
    if (has('open-guess')) {
      click('open-guess');
      const r = round();
      assert(!r.fake || !r.words.includes(r.fake), '라이어가 받은 단어가 정답 후보에 있음');
      const k = right ? r.words.indexOf(r.word) : r.words.findIndex((w) => w !== r.word);
      click('gpick', { k: String(k) });
      click('gcast');
    }
  }
  const result = { title: heading(), gains: (app.innerHTML.match(/class="gain">\+\d/g) || []).length / 2, roles };
  click('to-setup');
  return result;
}

const voteLiar = (roles) => (i) => { const l = roles.indexOf('liar'); return i === l ? (l + 1) % roles.length : l; };
const voteCitizen = (roles) => (i) => { const c = roles.indexOf('citizen'); return i === c ? (c + 1) % roles.length : c; };
const voteNext = (roles) => (i) => (i + 1) % roles.length;

boot();
let r;

r = play({ target: voteLiar });
assert.strictEqual(r.title, '시민 승리'); assert.strictEqual(r.gains, 3);

r = play({ target: voteLiar, right: true });
assert.strictEqual(r.title, '라이어 역전승'); assert.strictEqual(r.gains, 1);

r = play({ target: voteCitizen });
assert.strictEqual(r.title, '라이어 승리'); assert.strictEqual(r.gains, 1);

r = play({ target: voteNext });
assert.strictEqual(r.title, '라이어 승리', '두 번 연속 동점이면 라이어가 이김');

r = play({ set: { mode: 'fool', speakSec: 0, discussSec: 0, laps: 2 }, add: 3, liars: 2, target: voteLiar });
assert.strictEqual(r.roles.filter((x) => x === 'liar').length, 3);
assert.strictEqual(r.title, '시민 승리');

r = play({ spies: 2, target: voteLiar });
assert.strictEqual(r.roles.filter((x) => x === 'spy').length, 2, '스파이 2명');
assert.strictEqual(r.roles.filter((x) => x === 'liar').length, 3);

r = play({ liars: 9, target: voteLiar });
assert.strictEqual(r.roles.filter((x) => x === 'citizen').length, 0);
assert.strictEqual(r.gains, 0, '시민 없는 판은 점수 없음');

r = play({ set: { mode: 'basic' }, spies: -2, liars: 9, target: voteNext });
assert.strictEqual(r.title, '전원 라이어!'); assert.strictEqual(r.gains, 0);

click('start');
boot();
assert(app.innerHTML.includes('카드 확인 1/7'), '새로고침 후 진행 중인 판이 이어지지 않음');

// 발언은 항상 1번부터. 라이어 배정은 무작위라 1번이 라이어일 확률은 1/4이어야 한다
{
  for (const k of Object.keys(store)) delete store[k];
  boot();
  let liarFirst = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    click('start');
    const r = round();
    assert.deepStrictEqual(r.order, [0, 1, 2, 3], '발언은 항상 1번부터 자리 순서대로');
    if (r.roles[r.order[0]] === 'liar') liarFirst++;
    H.click({ target: { closest: () => ({ dataset: { a: 'quit-yes' }, disabled: false }) } });
  }
  const p = liarFirst / N;
  assert(p > 0.21 && p < 0.29, '1번이 라이어일 비율이 1/4에서 벗어남: ' + p);
  console.log('1번이 라이어인 비율: ' + (p * 100).toFixed(1) + '% (기대 25%)');
}

// 다크 모드 스위치
click('theme'); assert.strictEqual(root.attrs['data-mode'], 'dark');
click('theme'); assert.strictEqual(root.attrs['data-mode'], 'light');

// 기본 주제: 40개 이상, 주제마다 겹치지 않는 단어 20개
const BUILTIN = (0, eval)('(' + js.match(/var BUILTIN=(\{[\s\S]*?\n\});/)[1] + ')');
assert(Object.keys(BUILTIN).length >= 40, '기본 주제가 40개보다 적음');
for (const [name, words] of Object.entries(BUILTIN)) {
  assert.strictEqual(words.length, 20, name + ' 단어 수');
  assert.strictEqual(new Set(words).size, 20, name + '에 겹치는 단어가 있음');
}

// AI로 단어 채우기: Claude 아티팩트에서만 생기는 window.claude를 흉내 낸다
(async () => {
  for (const k of Object.keys(store)) delete store[k];
  let asked = '';
  const answer = '여기 있어요:\n["새우깡", "포카칩", "꼬깔콘", "새우깡", "홈런볼", "빼빼로"]';
  global.window.claude = { use: (n) => Promise.resolve(n === 'sample' ? (input) => { asked = input; return Promise.resolve({ text: answer }); } : null) };
  boot();
  await new Promise((r) => setTimeout(r, 0));
  click('cat-open');
  assert(has('ai-fill'), 'AI 버튼이 안 보임');
  H.input({ target: { dataset: {}, id: 'ccName', value: '과자' } });
  click('ai-fill');
  await new Promise((r) => setTimeout(r, 0));
  assert(asked.includes('과자'), '주제가 AI에게 전달되지 않음');
  assert(app.innerHTML.includes('새우깡, 포카칩, 꼬깔콘, 홈런볼, 빼빼로'), 'AI 단어가 채워지지 않음(중복 제거 포함)');
  click('add-cat');
  assert(app.innerHTML.includes('data-c="과자"'), '만든 주제가 목록에 없음');

  delete global.window.claude;
  boot();
  click('cat-open');
  assert(!has('ai-fill'), 'Claude 밖에서는 AI 버튼이 없어야 함');

  console.log('ok: 판 9개, 기본 주제 ' + Object.keys(BUILTIN).length + '개, AI 채우기 통과');
})().catch((e) => { console.error(e); process.exit(1); });

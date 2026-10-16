import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newMatch, startRound, answerWith, rangeForRound,
  ROUNDS, WIN_THRESHOLD, CHOICE_COUNT,
} from '../js/mathgame.js';

test('newMatch は idle 状態で始まる', () => {
  const m = newMatch();
  assert.equal(m.phase, 'idle');
  assert.equal(m.round, 0);
  assert.equal(m.wins, 0);
  assert.equal(m.finished, false);
});

test('startRound で出題され、答えは a + b', () => {
  const m = newMatch();
  startRound(m);
  assert.equal(m.phase, 'question');
  assert.equal(m.answer, m.a + m.b);
});

test('選択肢は3つで、正解をふくみ、重複しない', () => {
  for (let i = 0; i < 300; i++) {
    const m = newMatch();
    m.round = i % ROUNDS;
    startRound(m);
    assert.equal(m.choices.length, CHOICE_COUNT, '選択肢の数');
    assert.ok(m.choices.includes(m.answer), '正解がふくまれる');
    assert.equal(new Set(m.choices).size, CHOICE_COUNT, '重複なし');
    assert.ok(m.choices.every((c) => c > 0), `0以下の選択肢: ${m.choices}`);
  }
});

test('ラウンドが進むほど むずかしくなる', () => {
  // 0-1: くりあがりなし(答えは10以下)
  for (let round of [0, 1]) {
    for (let i = 0; i < 100; i++) {
      const m = newMatch();
      m.round = round;
      startRound(m);
      assert.ok(m.answer <= 10, `かんたんな問題のはず: ${m.a}+${m.b}`);
    }
  }
  // 4: 2けた + 1けた
  for (let i = 0; i < 100; i++) {
    const m = newMatch();
    m.round = 4;
    startRound(m);
    assert.ok(m.a >= 10, `2けたのはず: ${m.a}`);
  }
});

test('出題範囲はラウンドごとに定義されている', () => {
  for (let round = 0; round < ROUNDS; round++) {
    const r = rangeForRound(round);
    assert.ok(r.aMin <= r.aMax && r.bMin <= r.bMax, `range が逆: round ${round}`);
  }
});

test('正解を選ぶと成功', () => {
  const m = newMatch();
  startRound(m);
  assert.equal(answerWith(m, m.answer), 'hit');
  assert.equal(m.wins, 1);
  assert.equal(m.lastResult, true);
  assert.equal(m.phase, 'result');
});

test('まちがいを選ぶと失敗', () => {
  const m = newMatch();
  startRound(m);
  const wrong = m.choices.find((c) => c !== m.answer);
  assert.equal(answerWith(m, wrong), 'miss');
  assert.equal(m.wins, 0);
  assert.equal(m.lastResult, false);
  assert.equal(m.lastPick, wrong);
});

test('答えたあとの追加入力は無視される(二重確定防止)', () => {
  const m = newMatch();
  startRound(m);
  answerWith(m, m.answer);
  assert.equal(answerWith(m, m.answer), 'ignored');
  assert.equal(m.wins, 1);
  assert.equal(m.round, 1);
});

test('startRound する前の入力は無視される', () => {
  const m = newMatch();
  assert.equal(answerWith(m, 3), 'ignored');
  assert.equal(m.round, 0);
});

test('5ラウンド、3問せいかいでクリア', () => {
  const m = newMatch();
  for (let i = 0; i < ROUNDS; i++) {
    startRound(m);
    if (i < WIN_THRESHOLD) answerWith(m, m.answer);
    else answerWith(m, m.choices.find((c) => c !== m.answer));
  }
  assert.equal(m.finished, true);
  assert.equal(m.wins, WIN_THRESHOLD);
  assert.equal(m.won, true);
});

test('5ラウンド、3問未満なら敗北', () => {
  const m = newMatch();
  for (let i = 0; i < ROUNDS; i++) {
    startRound(m);
    if (i < WIN_THRESHOLD - 1) answerWith(m, m.answer);
    else answerWith(m, m.choices.find((c) => c !== m.answer));
  }
  assert.equal(m.finished, true);
  assert.equal(m.won, false);
});

test('クリア後に startRound しても何も起きない', () => {
  const m = newMatch();
  for (let i = 0; i < ROUNDS; i++) { startRound(m); answerWith(m, m.answer); }
  const a = m.a;
  startRound(m);
  assert.equal(m.a, a);
});

test('正解の位置はかたよらない', () => {
  const positions = [0, 0, 0];
  for (let i = 0; i < 600; i++) {
    const m = newMatch();
    startRound(m);
    positions[m.choices.indexOf(m.answer)]++;
  }
  // どの位置も 600/3=200 からおおきくずれない(1番目固定などになっていないこと)
  for (const count of positions) {
    assert.ok(count > 120, `かたよりすぎ: ${positions}`);
  }
});

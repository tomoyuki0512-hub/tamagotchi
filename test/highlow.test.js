import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newMatch, startRound, guess, ROUNDS, WIN_THRESHOLD, MIN_NUMBER, MAX_NUMBER,
} from '../js/highlow.js';

// 当たる側を計算して答える
function guessCorrectly(m) {
  return guess(m, m.hidden > m.shown ? 'high' : 'low');
}
function guessWrongly(m) {
  return guess(m, m.hidden > m.shown ? 'low' : 'high');
}

test('newMatch は idle 状態で始まる', () => {
  const m = newMatch();
  assert.equal(m.phase, 'idle');
  assert.equal(m.round, 0);
  assert.equal(m.wins, 0);
  assert.equal(m.finished, false);
});

test('startRound で2つの数字が決まり、同じ数字にはならない', () => {
  for (let i = 0; i < 200; i++) {
    const m = newMatch();
    startRound(m);
    assert.equal(m.phase, 'guess');
    assert.notEqual(m.shown, m.hidden, '引き分けが出ないこと');
    for (const n of [m.shown, m.hidden]) {
      assert.ok(Number.isInteger(n) && n >= MIN_NUMBER && n <= MAX_NUMBER, `範囲外: ${n}`);
    }
  }
});

test('正しい側を答えると成功', () => {
  const m = newMatch();
  startRound(m);
  assert.equal(guessCorrectly(m), 'hit');
  assert.equal(m.wins, 1);
  assert.equal(m.lastResult, true);
  assert.equal(m.phase, 'result');
});

test('間違えた側を答えると失敗', () => {
  const m = newMatch();
  startRound(m);
  assert.equal(guessWrongly(m), 'miss');
  assert.equal(m.wins, 0);
  assert.equal(m.lastResult, false);
});

test('答えたあとの追加入力は無視される(二重確定防止)', () => {
  const m = newMatch();
  startRound(m);
  guessCorrectly(m);
  assert.equal(guess(m, 'high'), 'ignored');
  assert.equal(m.wins, 1);
  assert.equal(m.round, 1);
});

test('startRound する前の入力は無視される', () => {
  const m = newMatch();
  assert.equal(guess(m, 'high'), 'ignored');
  assert.equal(m.round, 0);
});

test('5ラウンド、3勝以上でクリア', () => {
  const m = newMatch();
  for (let i = 0; i < ROUNDS; i++) {
    startRound(m);
    if (i < WIN_THRESHOLD) guessCorrectly(m); else guessWrongly(m);
  }
  assert.equal(m.finished, true);
  assert.equal(m.wins, WIN_THRESHOLD);
  assert.equal(m.won, true);
});

test('5ラウンド、3勝未満なら敗北', () => {
  const m = newMatch();
  for (let i = 0; i < ROUNDS; i++) {
    startRound(m);
    if (i < WIN_THRESHOLD - 1) guessCorrectly(m); else guessWrongly(m);
  }
  assert.equal(m.finished, true);
  assert.equal(m.won, false);
});

test('クリア後に startRound しても何も起きない', () => {
  const m = newMatch();
  for (let i = 0; i < ROUNDS; i++) { startRound(m); guessCorrectly(m); }
  const shown = m.shown;
  startRound(m);
  assert.equal(m.shown, shown);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newMatch, startRound, beginInput, pressKey,
  sequenceLengthForRound, ROUNDS, WIN_THRESHOLD,
} from '../js/memorygame.js';

// 出題どおりに最後まで押す
function playCorrectly(m) {
  let r;
  for (const side of m.sequence) r = pressKey(m, side);
  return r;
}

test('newMatch は idle 状態で始まる', () => {
  const m = newMatch();
  assert.equal(m.phase, 'idle');
  assert.equal(m.round, 0);
  assert.equal(m.wins, 0);
  assert.equal(m.finished, false);
});

test('覚える数はラウンドが進むほど増える(2→3→4)', () => {
  assert.equal(sequenceLengthForRound(0), 2);
  assert.equal(sequenceLengthForRound(1), 3);
  assert.equal(sequenceLengthForRound(2), 4);
});

test('startRound で showing になり、出題が作られる', () => {
  const m = newMatch();
  startRound(m);
  assert.equal(m.phase, 'showing');
  assert.equal(m.sequence.length, 2);
  assert.ok(m.sequence.every((s) => s === 'left' || s === 'right'));
  assert.equal(m.inputIndex, 0);
});

test('出題の再生中は入力を受け付けない', () => {
  const m = newMatch();
  startRound(m);
  assert.equal(pressKey(m, m.sequence[0]), 'ignored');
  assert.equal(m.inputIndex, 0);
});

test('beginInput は showing からしか input にならない(二重発火防止)', () => {
  const m = newMatch();
  startRound(m);
  beginInput(m);
  assert.equal(m.phase, 'input');
  pressKey(m, m.sequence[0]);
  assert.equal(m.inputIndex, 1);
  beginInput(m); // 2回目は無視され、途中の入力状態が壊れない
  assert.equal(m.phase, 'input');
  assert.equal(m.inputIndex, 1);
});

test('順番どおりに押すとラウンド成功', () => {
  const m = newMatch();
  startRound(m);
  beginInput(m);
  assert.equal(playCorrectly(m), 'roundWon');
  assert.equal(m.wins, 1);
  assert.equal(m.round, 1);
  assert.equal(m.lastResult, true);
  assert.equal(m.phase, 'result');
});

test('途中まで合っていても、1つ間違えたらその場で失敗', () => {
  const m = newMatch();
  startRound(m);
  beginInput(m);
  assert.equal(pressKey(m, m.sequence[0]), 'progress');
  const wrong = m.sequence[1] === 'left' ? 'right' : 'left';
  assert.equal(pressKey(m, wrong), 'roundLost');
  assert.equal(m.wins, 0);
  assert.equal(m.lastResult, false);
});

test('結果が出たあとの追加入力は無視される(二重確定防止)', () => {
  const m = newMatch();
  startRound(m);
  beginInput(m);
  playCorrectly(m);
  const wins = m.wins;
  assert.equal(pressKey(m, 'left'), 'ignored');
  assert.equal(m.wins, wins);
});

test('3ラウンドで2勝以上ならクリア', () => {
  const m = newMatch();
  for (let i = 0; i < ROUNDS; i++) {
    startRound(m);
    beginInput(m);
    if (i < WIN_THRESHOLD) playCorrectly(m);
    else pressKey(m, m.sequence[0] === 'left' ? 'right' : 'left');
  }
  assert.equal(m.finished, true);
  assert.equal(m.wins, WIN_THRESHOLD);
  assert.equal(m.won, true);
});

test('3ラウンドで2勝未満なら敗北', () => {
  const m = newMatch();
  for (let i = 0; i < ROUNDS; i++) {
    startRound(m);
    beginInput(m);
    if (i < WIN_THRESHOLD - 1) playCorrectly(m);
    else pressKey(m, m.sequence[0] === 'left' ? 'right' : 'left');
  }
  assert.equal(m.finished, true);
  assert.equal(m.won, false);
});

test('クリア後に startRound しても何も起きない', () => {
  const m = newMatch();
  for (let i = 0; i < ROUNDS; i++) { startRound(m); beginInput(m); playCorrectly(m); }
  const seq = m.sequence;
  startRound(m);
  assert.equal(m.sequence, seq);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSession, tick, isOnBreak, remainingBreakMs, PLAY_MS, BREAK_MS } from '../js/breaktimer.js';

const T0 = 1_000_000_000; // 適当な基準時刻(ms)

test('newSession は未開始の状態', () => {
  const s = newSession();
  assert.equal(s.playStartAt, null);
  assert.equal(s.breakUntil, null);
  assert.equal(isOnBreak(s, T0), false);
});

test('最初の tick で playStartAt が記録される', () => {
  let s = newSession();
  s = tick(s, T0);
  assert.equal(s.playStartAt, T0);
  assert.equal(s.breakUntil, null);
});

test('5分未満は休憩に入らない', () => {
  let s = newSession();
  s = tick(s, T0);
  s = tick(s, T0 + PLAY_MS - 1);
  assert.equal(s.breakUntil, null);
  assert.equal(isOnBreak(s, T0 + PLAY_MS - 1), false);
});

test('5分あそぶと10分間の休憩に入る', () => {
  let s = newSession();
  s = tick(s, T0);
  s = tick(s, T0 + PLAY_MS);
  assert.equal(s.breakUntil, T0 + PLAY_MS + BREAK_MS);
  assert.equal(isOnBreak(s, T0 + PLAY_MS), true);
});

test('休憩中は残り時間が正しく減っていく', () => {
  let s = newSession();
  s = tick(s, T0);
  s = tick(s, T0 + PLAY_MS);
  const remain = remainingBreakMs(s, T0 + PLAY_MS + 1000);
  assert.equal(remain, BREAK_MS - 1000);
});

test('休憩中に tick しても状態は変わらない(同じ session 参照を返す)', () => {
  let s = newSession();
  s = tick(s, T0);
  s = tick(s, T0 + PLAY_MS);
  const beforeBreakUntil = s.breakUntil;
  const s2 = tick(s, T0 + PLAY_MS + 5000);
  assert.equal(s2, s); // 参照が同じ = 変化なし
  assert.equal(s2.breakUntil, beforeBreakUntil);
});

test('休憩が終わると新しいあそび時間が始まる', () => {
  let s = newSession();
  s = tick(s, T0);
  s = tick(s, T0 + PLAY_MS); // 休憩開始
  const breakEndsAt = s.breakUntil;
  s = tick(s, breakEndsAt);
  assert.equal(s.breakUntil, null);
  assert.equal(s.playStartAt, breakEndsAt);
  assert.equal(isOnBreak(s, breakEndsAt), false);
});

test('休憩後、再び5分あそぶとまた休憩になる(サイクルする)', () => {
  let s = newSession();
  s = tick(s, T0);
  s = tick(s, T0 + PLAY_MS); // 1回目の休憩開始
  const breakEndsAt = s.breakUntil;
  s = tick(s, breakEndsAt); // 休憩終了、次のあそび時間開始
  s = tick(s, breakEndsAt + PLAY_MS); // 2回目の休憩開始
  assert.equal(s.breakUntil, breakEndsAt + PLAY_MS + BREAK_MS);
  assert.equal(isOnBreak(s, breakEndsAt + PLAY_MS), true);
});

test('remainingBreakMs は休憩中でなければ0', () => {
  const s = newSession();
  assert.equal(remainingBreakMs(s, T0), 0);
});

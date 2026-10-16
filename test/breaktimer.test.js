import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newSession, tick, isOnBreak, remainingBreakMs, remainingPlayMs,
  PLAY_MS, BREAK_MS, MAX_STEP_MS,
} from '../js/breaktimer.js';

const T0 = 1_000_000_000; // 適当な基準時刻(ms)

// 1秒ずつ tick して、実際にアプリを開いて遊んでいる状態を再現する。
// 初回の tick は「開いた瞬間」の基準を作るだけなので、ループの前に済ませる。
function playFor(session, startAt, ms, stepMs = 1000) {
  let s = session.lastSeenAt == null && session.breakUntil == null ? tick(session, startAt) : session;
  let t = startAt;
  for (let elapsed = 0; elapsed < ms; elapsed += stepMs) {
    t += stepMs;
    s = tick(s, t);
  }
  return { session: s, now: t };
}

test('newSession は未開始の状態', () => {
  const s = newSession();
  assert.equal(s.playedMs, 0);
  assert.equal(s.breakUntil, null);
  assert.equal(isOnBreak(s, T0), false);
});

test('最初の tick では休憩に入らない', () => {
  const s = tick(newSession(), T0);
  assert.equal(isOnBreak(s, T0), false);
  assert.equal(s.playedMs, 0, '初回は数えるもとがないので0');
});

test('あそんだ時間は tick の間隔ぶんだけ積み上がる', () => {
  const { session } = playFor(newSession(), T0, 10_000);
  assert.equal(session.playedMs, 10_000);
  assert.equal(isOnBreak(session, T0 + 10_000), false);
});

test('5分あそぶと5分間の休憩に入る', () => {
  const { session, now } = playFor(newSession(), T0, PLAY_MS);
  assert.equal(isOnBreak(session, now), true);
  assert.equal(session.breakUntil, now + BREAK_MS, '休憩はその時点から5分');
});

test('5分に少し足りなければ休憩にならない', () => {
  const { session, now } = playFor(newSession(), T0, PLAY_MS - 2000);
  assert.equal(isOnBreak(session, now), false);
});

// ここが今回の修正点 ---------------------------------------------------------

test('アプリを閉じていた時間は「あそんだ時間」に数えない', () => {
  // 2分あそんでから閉じる
  const { session, now } = playFor(newSession(), T0, 2 * 60 * 1000);
  assert.equal(session.playedMs, 2 * 60 * 1000);

  // 1時間後に開き直す(tick の間隔が大きく開く)
  const reopened = tick(session, now + 60 * 60 * 1000);
  assert.equal(reopened.playedMs, 2 * 60 * 1000, '閉じていた1時間は数えない');
  assert.equal(isOnBreak(reopened, now + 60 * 60 * 1000), false, '開いた直後に休憩にならない');
});

test('久しぶりに開いても、残りのあそび時間はちゃんと残っている', () => {
  const { session, now } = playFor(newSession(), T0, 2 * 60 * 1000);
  const reopenAt = now + 24 * 60 * 60 * 1000; // 1日後
  let s = tick(session, reopenAt);
  assert.equal(remainingPlayMs(s), 3 * 60 * 1000, 'のこり3分');

  // そこから3分あそぶと休憩になる
  const after = playFor(s, reopenAt, 3 * 60 * 1000);
  assert.equal(isOnBreak(after.session, after.now), true);
});

test('はじめて開いたときは休憩にならない(5分ぶん遊べる)', () => {
  let s = newSession();
  s = tick(s, T0);
  assert.equal(remainingPlayMs(s), PLAY_MS);
  const { session, now } = playFor(s, T0, PLAY_MS - 1000);
  assert.equal(isOnBreak(session, now), false);
});

test('時計が戻っても あそんだ時間は増えない', () => {
  const { session, now } = playFor(newSession(), T0, 10_000);
  const back = tick(session, now - 60_000);
  assert.equal(back.playedMs, session.playedMs);
});

test('tick の間隔が上限を超えるぶんは切り捨てる', () => {
  let s = tick(newSession(), T0);
  s = tick(s, T0 + MAX_STEP_MS);      // ちょうど上限 → 数える
  assert.equal(s.playedMs, MAX_STEP_MS);
  s = tick(s, T0 + MAX_STEP_MS * 3);  // 上限超え → 数えない
  assert.equal(s.playedMs, MAX_STEP_MS);
});

// 休憩のふるまい -------------------------------------------------------------

test('休憩中は残り時間が正しく減っていく', () => {
  const { session, now } = playFor(newSession(), T0, PLAY_MS);
  assert.equal(remainingBreakMs(session, now + 1000), BREAK_MS - 1000);
});

test('休憩中に tick しても状態は変わらない(同じ session 参照を返す)', () => {
  const { session, now } = playFor(newSession(), T0, PLAY_MS);
  const s2 = tick(session, now + 5000);
  assert.equal(s2, session, '参照が同じ = 変化なし');
});

test('休憩はアプリを閉じても短くならない(実時刻で持つ)', () => {
  const { session, now } = playFor(newSession(), T0, PLAY_MS);
  // 閉じて2分後に開き直す → まだ休憩中
  assert.equal(isOnBreak(session, now + 2 * 60 * 1000), true);
  // 5分たてば終わっている
  assert.equal(isOnBreak(session, now + BREAK_MS), false);
});

test('休憩が終わると あそんだ時間がリセットされる', () => {
  const { session, now } = playFor(newSession(), T0, PLAY_MS);
  const after = tick(session, now + BREAK_MS);
  assert.equal(after.breakUntil, null);
  assert.equal(after.playedMs, 0);
  assert.equal(remainingPlayMs(after), PLAY_MS);
});

test('休憩後、また5分あそぶと休憩になる(サイクルする)', () => {
  const first = playFor(newSession(), T0, PLAY_MS);
  const breakEndsAt = first.session.breakUntil;
  const resumed = tick(first.session, breakEndsAt);
  const second = playFor(resumed, breakEndsAt, PLAY_MS);
  assert.equal(isOnBreak(second.session, second.now), true);
});

test('remainingBreakMs は休憩中でなければ0', () => {
  assert.equal(remainingBreakMs(newSession(), T0), 0);
});

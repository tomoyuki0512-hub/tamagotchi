// breaktimer.js — 5分あそんだら5分休憩、を管理する純粋ロジック(DOM非依存)
// main.js が毎秒 tick() する。
//
// 「あそんだ時間」は、アプリを実際に開いていた時間だけを積み上げる。
// (閉じていたあいだを数えると、久しぶりに開いたとたん休憩になってしまうため)
// 一方で休憩の残り時間は実時刻で持つので、閉じて開き直しても休憩は短くならない。

export const PLAY_MS = 5 * 60 * 1000;
export const BREAK_MS = 5 * 60 * 1000;
// 1回の tick で「あそんだ時間」に足せる上限。これを超える間隔は
// アプリを閉じていた(または画面を見ていなかった)とみなして数えない。
export const MAX_STEP_MS = 3000;

export function newSession() {
  return { playedMs: 0, lastSeenAt: null, breakUntil: null };
}

// 毎秒呼び出す。状態が変わらない場合は同じ session 参照を返す
export function tick(session, now) {
  if (session.breakUntil != null) {
    if (now < session.breakUntil) return session; // まだ休憩中
    return { playedMs: 0, lastSeenAt: now, breakUntil: null }; // 休憩終了
  }

  const since = session.lastSeenAt == null ? 0 : now - session.lastSeenAt;
  // 間隔が長すぎる(閉じていた)・マイナス(時計が戻った)ときは数えない
  const step = since > 0 && since <= MAX_STEP_MS ? since : 0;
  const playedMs = (session.playedMs || 0) + step;

  if (playedMs >= PLAY_MS) {
    return { playedMs, lastSeenAt: now, breakUntil: now + BREAK_MS };
  }
  return { playedMs, lastSeenAt: now, breakUntil: null };
}

export function isOnBreak(session, now) {
  return session.breakUntil != null && session.breakUntil > now;
}

export function remainingBreakMs(session, now) {
  return session.breakUntil != null ? Math.max(0, session.breakUntil - now) : 0;
}

// あそべる残り時間(休憩に入るまで)
export function remainingPlayMs(session) {
  return Math.max(0, PLAY_MS - (session.playedMs || 0));
}

// breaktimer.js — 5分あそんだら10分休憩、を管理する純粋ロジック(DOM非依存)
// アプリを閉じても localStorage 経由で継続するよう、main.js が session を毎秒 tick() する。

export const PLAY_MS = 5 * 60 * 1000;
export const BREAK_MS = 10 * 60 * 1000;

export function newSession() {
  return { playStartAt: null, breakUntil: null };
}

// 毎秒呼び出す。状態が変わらない場合は同じ session 参照を返す(呼び出し側が保存要否を判定できるように)
export function tick(session, now) {
  if (session.breakUntil != null) {
    if (now >= session.breakUntil) {
      return { playStartAt: now, breakUntil: null }; // 休憩終了、新しいあそび時間を開始
    }
    return session; // まだ休憩中
  }
  if (session.playStartAt == null) {
    return { ...session, playStartAt: now };
  }
  if (now - session.playStartAt >= PLAY_MS) {
    return { playStartAt: session.playStartAt, breakUntil: now + BREAK_MS };
  }
  return session;
}

export function isOnBreak(session, now) {
  return session.breakUntil != null && session.breakUntil > now;
}

export function remainingBreakMs(session, now) {
  return session.breakUntil != null ? Math.max(0, session.breakUntil - now) : 0;
}

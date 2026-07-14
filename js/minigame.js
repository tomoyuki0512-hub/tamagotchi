// minigame.js — みぎひだり はんしゃゲーム(反射神経ゲーム)
// 合図が出てから制限時間内に正しい側を押せたら成功。運ではなく反応速度で勝負。
// UI(main.js)はタイマーで startRound → reveal → resolveTap/resolveTimeout を駆動する。

export const ROUNDS = 5;
export const WIN_THRESHOLD = 3;
export const REVEAL_DELAY_MIN = 600;
export const REVEAL_DELAY_MAX = 1600;

// ラウンドが進むほど反応時間が短くなる(0始まり: 850, 780, 710, 640, 570ms)
export function windowMsForRound(round) {
  return 850 - round * 70;
}

export function newMatch() {
  return {
    round: 0,
    wins: 0,
    finished: false,
    won: false,
    target: null,   // 'left' | 'right'
    phase: 'idle',  // 'idle' | 'waiting' | 'active' | 'result'
    lastResult: null, // true(成功) | false(失敗) | null
  };
}

// 新しいラウンドを開始し、出題(光る側)を決める
export function startRound(match) {
  if (match.finished) return match;
  match.target = Math.random() < 0.5 ? 'left' : 'right';
  match.phase = 'waiting';
  match.lastResult = null;
  return match;
}

// 「よーい」から「ひかる」へ。waiting からしか遷移しない(二重発火防止)
export function reveal(match) {
  if (match.phase !== 'waiting') return match;
  match.phase = 'active';
  return match;
}

function finishRound(match, hit) {
  match.lastResult = hit;
  match.phase = 'result';
  if (hit) match.wins++;
  match.round++;
  if (match.round >= ROUNDS) {
    match.finished = true;
    match.won = match.wins >= WIN_THRESHOLD;
  }
}

// ボタン押下時の判定。phase に応じてフライング/正誤を判定する
export function resolveTap(match, choice) {
  if (match.finished || match.phase === 'result' || match.phase === 'idle') return match;
  const hit = match.phase === 'active' && choice === match.target;
  finishRound(match, hit);
  return match;
}

// 制限時間切れ。active のときだけ失敗として確定(タップ済みなら何もしない)
export function resolveTimeout(match) {
  if (match.phase !== 'active') return match;
  finishRound(match, false);
  return match;
}

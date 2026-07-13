// minigame.js — 左右当てゲーム(5回勝負、3勝で勝ち)
// UI から newMatch() → guess('left'|'right') を5回呼ぶ。

export const ROUNDS = 5;
export const WIN_THRESHOLD = 3;

export function newMatch() {
  return { round: 0, wins: 0, finished: false, won: false, lastAnswer: null, lastCorrect: null };
}

export function guess(match, choice) {
  if (match.finished) return match;
  const answer = Math.random() < 0.5 ? 'left' : 'right';
  match.lastAnswer = answer;
  match.lastCorrect = choice === answer;
  if (match.lastCorrect) match.wins++;
  match.round++;
  if (match.round >= ROUNDS) {
    match.finished = true;
    match.won = match.wins >= WIN_THRESHOLD;
  }
  return match;
}

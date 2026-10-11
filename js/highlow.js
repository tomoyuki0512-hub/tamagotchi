// highlow.js — たかい ひくい ゲーム(運だめし)
// 表の数字より、ふせてある数字が大きいか小さいかを当てる。
// 同じ数字は出ないので「引き分け」はない。

export const ROUNDS = 5;
export const WIN_THRESHOLD = 3;
export const MIN_NUMBER = 1;
export const MAX_NUMBER = 9;

export function newMatch() {
  return {
    round: 0,
    wins: 0,
    finished: false,
    won: false,
    shown: null,    // 表の数字
    hidden: null,   // ふせてある数字
    phase: 'idle',  // 'idle' | 'guess' | 'result'
    lastResult: null,
    lastGuess: null, // 'high' | 'low'
  };
}

function randomNumber() {
  return MIN_NUMBER + Math.floor(Math.random() * (MAX_NUMBER - MIN_NUMBER + 1));
}

export function startRound(match) {
  if (match.finished) return match;
  match.shown = randomNumber();
  do {
    match.hidden = randomNumber();
  } while (match.hidden === match.shown); // 引き分けなし
  match.phase = 'guess';
  match.lastResult = null;
  match.lastGuess = null;
  return match;
}

// 'high'(たかい) か 'low'(ひくい)を答える
export function guess(match, choice) {
  if (match.phase !== 'guess') return 'ignored';

  const actuallyHigher = match.hidden > match.shown;
  const success = (choice === 'high') === actuallyHigher;

  match.phase = 'result';
  match.lastGuess = choice;
  match.lastResult = success;
  if (success) match.wins++;
  match.round++;
  if (match.round >= ROUNDS) {
    match.finished = true;
    match.won = match.wins >= WIN_THRESHOLD;
  }
  return success ? 'hit' : 'miss';
}

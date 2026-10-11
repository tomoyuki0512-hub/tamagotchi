// memorygame.js — まねっこゲーム(記憶力)
// キャラが光らせた順番を覚えて、同じ順番に押せたら成功。
// UI(main.js)が showing → beginInput → pressKey を駆動する。

export const ROUNDS = 3;
export const WIN_THRESHOLD = 2;
export const FLASH_MS = 520;      // 1つぶんの点灯時間
export const FLASH_GAP_MS = 220;  // 点灯と点灯のあいだ

// ラウンドが進むほど覚える数が増える(0始まり: 2, 3, 4)
export function sequenceLengthForRound(round) {
  return round + 2;
}

export function newMatch() {
  return {
    round: 0,
    wins: 0,
    finished: false,
    won: false,
    sequence: [],     // ['left','right',...]
    inputIndex: 0,
    phase: 'idle',    // 'idle' | 'showing' | 'input' | 'result'
    lastResult: null,
  };
}

// 新しいラウンドを開始し、覚える順番を決める(まだ入力は受け付けない)
export function startRound(match) {
  if (match.finished) return match;
  const len = sequenceLengthForRound(match.round);
  match.sequence = Array.from({ length: len }, () => (Math.random() < 0.5 ? 'left' : 'right'));
  match.inputIndex = 0;
  match.phase = 'showing';
  match.lastResult = null;
  return match;
}

// 出題の再生が終わり、入力を受け付ける
export function beginInput(match) {
  if (match.phase !== 'showing') return match; // 二重発火防止
  match.phase = 'input';
  return match;
}

// 1つ押した。'progress'(まだ途中) / 'roundWon' / 'roundLost' を返す
export function pressKey(match, side) {
  if (match.phase !== 'input') return 'ignored';

  if (side !== match.sequence[match.inputIndex]) {
    finishRound(match, false);
    return 'roundLost';
  }

  match.inputIndex++;
  if (match.inputIndex >= match.sequence.length) {
    finishRound(match, true);
    return 'roundWon';
  }
  return 'progress';
}

function finishRound(match, success) {
  match.phase = 'result';
  match.lastResult = success;
  if (success) match.wins++;
  match.round++;
  if (match.round >= ROUNDS) {
    match.finished = true;
    match.won = match.wins >= WIN_THRESHOLD;
  }
}

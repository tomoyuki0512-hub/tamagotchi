// mathgame.js — たしざんゲーム(けいさん)
// 「3 + 4 = ?」の答えを3つの選択肢から選ぶ。時間制限はなく、じっくり考えられる。
// ラウンドが進むほど むずかしくなる。

export const ROUNDS = 5;
export const WIN_THRESHOLD = 3;
export const CHOICE_COUNT = 3;

// ラウンドごとの出題範囲(0始まり)
// 0-1: くりあがりなしの かんたんな たしざん
// 2-3: くりあがりのある 1けた + 1けた
// 4  : 2けた + 1けた
export function rangeForRound(round) {
  if (round <= 1) return { aMin: 1, aMax: 5, bMin: 1, bMax: 5 };
  if (round <= 3) return { aMin: 3, aMax: 9, bMin: 3, bMax: 9 };
  return { aMin: 10, aMax: 20, bMin: 2, bMax: 9 };
}

export function newMatch() {
  return {
    round: 0,
    wins: 0,
    finished: false,
    won: false,
    a: null,
    b: null,
    answer: null,
    choices: [],
    phase: 'idle',   // 'idle' | 'question' | 'result'
    lastResult: null,
    lastPick: null,
  };
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// 正解のまわりの数を まちがいの選択肢にする(0以下・重複は避ける)
function buildChoices(answer) {
  const choices = [answer];
  const offsets = [1, -1, 2, -2, 10, 3, -3];
  while (choices.length < CHOICE_COUNT) {
    const offset = offsets[Math.floor(Math.random() * offsets.length)];
    const candidate = answer + offset;
    if (candidate > 0 && !choices.includes(candidate)) choices.push(candidate);
  }
  // シャッフル(正解の位置がかたよらないように)
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices;
}

export function startRound(match) {
  if (match.finished) return match;
  const r = rangeForRound(match.round);
  match.a = randomInt(r.aMin, r.aMax);
  match.b = randomInt(r.bMin, r.bMax);
  match.answer = match.a + match.b;
  match.choices = buildChoices(match.answer);
  match.phase = 'question';
  match.lastResult = null;
  match.lastPick = null;
  return match;
}

// 選択肢を1つ選ぶ。'hit' / 'miss' / 'ignored' を返す
export function answerWith(match, value) {
  if (match.phase !== 'question') return 'ignored';

  const success = value === match.answer;
  match.phase = 'result';
  match.lastPick = value;
  match.lastResult = success;
  if (success) match.wins++;
  match.round++;
  if (match.round >= ROUNDS) {
    match.finished = true;
    match.won = match.wins >= WIN_THRESHOLD;
  }
  return success ? 'hit' : 'miss';
}

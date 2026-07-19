// engine.js — ゲームロジック本体(DOM 非依存の純粋ロジック)
// 1 tick = 実時間 1 分。catchUp() がオフライン経過も含めて同じコードで進める。

export const TICK_MS = 60 * 1000;

// 成長段階の境界(誕生からの経過 tick)
export const STAGE_BOUNDS = {
  egg: 1,            // 1分でふ化
  baby: 1 + 60,      // ベビー期 1時間
  child: 1 + 60 + 2 * 1440,  // こども期 2日
  teen: 1 + 60 + 5 * 1440,   // ティーン期 3日
};

// 就寝・起床時刻(現地時間の hour)
const SLEEP_HOURS = {
  baby: { sleep: 20, wake: 9 },
  child: { sleep: 21, wake: 9 },
  teen: { sleep: 22, wake: 8 },
  adult: { sleep: 22, wake: 8 },
};

// パラメータ減衰などの周期(tick 数)
const HUNGER_DECAY = 45;      // 45分でおなかハート -1
const HAPPY_DECAY = 55;       // 55分でごきげんハート -1
const POOP_INTERVAL = 170;    // 約3時間ごとにうんち
const SICK_FROM_HUNGER = 90;  // 空腹0が90分続くと病気
const SICK_FROM_POOP = 120;   // うんち満杯が2時間続くと病気
const DEATH_FROM_SICK = 360;  // 病気を6時間放置で死亡
const DEATH_FROM_HUNGER = 720;// 空腹0が12時間で死亡
const MISTAKE_AFTER = 60;     // 空腹/不機嫌0を1時間放置でお世話ミス
const LIGHT_MISTAKE_AFTER = 30; // 点灯したまま30分寝かせるとお世話ミス
const CALL_DURATION = 30;     // しつけ呼び出しは30分でタイムアウト
const CALL_HOURS = [11, 17];  // しつけ呼び出しが起きる時刻(こども/ティーン期)
const MAX_WEIGHT_HEALTHY = 60;// これ以上太ると病気になる
const MIN_WEIGHT = 5;

export const MAX_HEARTS = 4;
export const MAX_POOPS = 4;
export const PAT_COOLDOWN_MS = 3 * 60 * 1000; // なでる効果は3分に1回まで

// キャラクター定義(オリジナルキャラ)
export const CHARACTERS = {
  egg: { id: 'egg', name: 'たまご' },
  baby: { id: 'baby', name: 'ぷちまる' },
  child: { id: 'child', name: 'まめっこ' },
  teen: { id: 'teen', name: 'ぴよたん' },
  adult_good: { id: 'adult_good', name: 'きらりん' },
  adult_normal: { id: 'adult_normal', name: 'もちすけ' },
  adult_bad: { id: 'adult_bad', name: 'だららん' },
};

export function newGame(now, generation = 1) {
  return {
    version: 1,
    generation,
    bornAt: now,
    lastTick: now,
    stage: 'egg',
    character: 'egg',
    hunger: MAX_HEARTS,
    happy: MAX_HEARTS,
    weight: MIN_WEIGHT,
    discipline: 0,
    poops: 0,
    sick: false,
    asleep: false,
    lightsOff: false,
    dead: false,
    deathCause: null,
    careMistakes: 0,
    // 内部タイマー(tick カウンタ)
    hungerTimer: 0,
    happyTimer: 0,
    poopTimer: 0,
    hungerZeroTicks: 0,
    happyZeroTicks: 0,
    poopFullTicks: 0,
    sickTicks: 0,
    lightsOnSleepTicks: 0,
    hungerMistakeGiven: false,
    happyMistakeGiven: false,
    sickMistakeGiven: false,
    lightMistakeGiven: false,
    callActive: false,
    callTicks: 0,
    lastCallHour: null,
    lastPatAt: 0,
    events: [], // catchUp 中に起きた出来事(UI がダイジェスト表示後にクリア)
  };
}

function ageTicks(state, ts) {
  return Math.floor((ts - state.bornAt) / TICK_MS);
}

export function ageDays(state, now) {
  return Math.floor((now - state.bornAt) / (24 * 60 * 60 * 1000));
}

function stageForAge(ticks) {
  if (ticks < STAGE_BOUNDS.egg) return 'egg';
  if (ticks < STAGE_BOUNDS.baby) return 'baby';
  if (ticks < STAGE_BOUNDS.child) return 'child';
  if (ticks < STAGE_BOUNDS.teen) return 'teen';
  return 'adult';
}

// 寿命(日数)。お世話ミスが少ないほど長生き
function lifespanDays(state) {
  return 15 + Math.max(0, 6 - state.careMistakes);
}

function adultCharacter(state) {
  if (state.careMistakes <= 2 && state.discipline >= 75) return 'adult_good';
  if (state.careMistakes >= 6 || state.discipline < 25) return 'adult_bad';
  return 'adult_normal';
}

function pushEvent(state, type, ts) {
  state.events.push({ type, at: ts });
}

function isSleepTime(stage, hour) {
  const s = SLEEP_HOURS[stage];
  if (!s) return false;
  // 就寝時刻〜起床時刻(日をまたぐ)
  return hour >= s.sleep || hour < s.wake;
}

// 1 tick(1分)進める。ts はその tick の時刻。
function tickOnce(state, ts) {
  if (state.dead) return;

  const ticks = ageTicks(state, ts);
  const hour = new Date(ts).getHours();

  // --- 成長段階の遷移 ---
  const newStage = stageForAge(ticks);
  if (newStage !== state.stage) {
    state.stage = newStage;
    if (newStage === 'baby') {
      state.character = 'baby';
      state.hunger = 2;
      state.happy = 2;
      pushEvent(state, 'hatched', ts);
    } else if (newStage === 'adult') {
      state.character = adultCharacter(state);
      pushEvent(state, 'evolved:' + state.character, ts);
    } else {
      state.character = newStage;
      pushEvent(state, 'evolved:' + newStage, ts);
    }
  }

  if (state.stage === 'egg') return; // たまごは時間経過の影響を受けない

  // --- 睡眠 ---
  const shouldSleep = isSleepTime(state.stage, hour);
  if (shouldSleep && !state.asleep) {
    state.asleep = true;
    state.lightMistakeGiven = false;
    state.lightsOnSleepTicks = 0;
    pushEvent(state, 'fellAsleep', ts);
  } else if (!shouldSleep && state.asleep) {
    state.asleep = false;
    state.lightsOff = false; // 朝になったら電気をつける
    state.lightsOnSleepTicks = 0;
    pushEvent(state, 'wokeUp', ts);
  }

  if (state.asleep) {
    // 寝ている間はおなか・ごきげんは減らないが、電気がついていると不機嫌に
    if (!state.lightsOff) {
      state.lightsOnSleepTicks++;
      if (state.lightsOnSleepTicks >= LIGHT_MISTAKE_AFTER && !state.lightMistakeGiven) {
        state.careMistakes++;
        state.lightMistakeGiven = true;
        state.happy = Math.max(0, state.happy - 1);
        pushEvent(state, 'sleptWithLights', ts);
      }
    }
  } else {
    // --- 起きている間の減衰 ---
    state.hungerTimer++;
    state.happyTimer++;
    state.poopTimer++;

    if (state.hungerTimer >= HUNGER_DECAY) {
      state.hungerTimer = 0;
      if (state.hunger > 0) state.hunger--;
    }
    if (state.happyTimer >= HAPPY_DECAY) {
      state.happyTimer = 0;
      if (state.happy > 0) state.happy--;
    }
    if (state.poopTimer >= POOP_INTERVAL) {
      state.poopTimer = 0;
      if (state.poops < MAX_POOPS) {
        state.poops++;
        pushEvent(state, 'pooped', ts);
      }
    }

    // --- しつけ呼び出し(こども/ティーン期、1日2回)---
    if ((state.stage === 'child' || state.stage === 'teen') && !state.callActive) {
      const min = new Date(ts).getMinutes();
      if (CALL_HOURS.includes(hour) && min === 0 && state.lastCallHour !== hour + ':' + new Date(ts).getDate()) {
        state.callActive = true;
        state.callTicks = 0;
        state.lastCallHour = hour + ':' + new Date(ts).getDate();
        pushEvent(state, 'disciplineCall', ts);
      }
    }
    if (state.callActive) {
      state.callTicks++;
      if (state.callTicks >= CALL_DURATION) {
        state.callActive = false;
        state.careMistakes++;
        state.happy = Math.max(0, state.happy - 1);
        pushEvent(state, 'callIgnored', ts);
      }
    }
  }

  // --- 空腹・不機嫌の放置カウント(睡眠中も進む: 空腹のまま寝かせるのも良くない)---
  if (state.hunger === 0) {
    state.hungerZeroTicks++;
    if (state.hungerZeroTicks >= MISTAKE_AFTER && !state.hungerMistakeGiven) {
      state.careMistakes++;
      state.hungerMistakeGiven = true;
    }
  } else {
    state.hungerZeroTicks = 0;
    state.hungerMistakeGiven = false;
  }

  if (state.happy === 0) {
    state.happyZeroTicks++;
    if (state.happyZeroTicks >= MISTAKE_AFTER && !state.happyMistakeGiven) {
      state.careMistakes++;
      state.happyMistakeGiven = true;
    }
  } else {
    state.happyZeroTicks = 0;
    state.happyMistakeGiven = false;
  }

  if (state.poops >= MAX_POOPS) {
    state.poopFullTicks++;
  } else {
    state.poopFullTicks = 0;
  }

  // --- 病気 ---
  if (!state.sick) {
    if (
      state.hungerZeroTicks >= SICK_FROM_HUNGER ||
      state.poopFullTicks >= SICK_FROM_POOP ||
      state.weight >= MAX_WEIGHT_HEALTHY
    ) {
      state.sick = true;
      state.sickTicks = 0;
      state.sickMistakeGiven = false;
      pushEvent(state, 'gotSick', ts);
    }
  } else {
    state.sickTicks++;
    if (state.sickTicks >= 120 && !state.sickMistakeGiven) {
      state.careMistakes++;
      state.sickMistakeGiven = true;
    }
  }

  // --- 死亡判定 ---
  let cause = null;
  if (state.sick && state.sickTicks >= DEATH_FROM_SICK) cause = 'sickness';
  else if (state.hungerZeroTicks >= DEATH_FROM_HUNGER) cause = 'hunger';
  else if (state.stage === 'adult' && ageDays(state, ts) >= lifespanDays(state)) cause = 'oldAge';

  if (cause) {
    state.dead = true;
    state.deathCause = cause;
    state.asleep = false;
    state.callActive = false;
    pushEvent(state, 'died:' + cause, ts);
  }
}

// lastTick から now までを1分刻みでシミュレートする(通常運転もオフライン復帰も同じ経路)
export function catchUp(state, now) {
  let processed = 0;
  while (state.lastTick + TICK_MS <= now && !state.dead) {
    state.lastTick += TICK_MS;
    tickOnce(state, state.lastTick);
    processed++;
  }
  if (state.dead) state.lastTick = now;
  return processed;
}

// --- ユーザー操作。戻り値は UI 表示用の結果コード ---

function canAct(state) {
  return !state.dead && state.stage !== 'egg' && !state.asleep;
}

export function feedMeal(state) {
  if (!canAct(state)) return 'unavailable';
  if (state.hunger >= MAX_HEARTS) return 'refused';
  state.hunger++;
  state.weight++;
  return 'ok';
}

export function feedSnack(state) {
  if (!canAct(state)) return 'unavailable';
  state.happy = Math.min(MAX_HEARTS, state.happy + 1);
  state.weight += 2;
  return 'ok';
}

// キャラをタップ(なでる)。連打対策で実際のごきげん上昇は PAT_COOLDOWN_MS に1回まで。
export function patPet(state, now) {
  if (state.dead || state.stage === 'egg') return 'unavailable';
  if (state.asleep) return 'asleep';
  if (now - (state.lastPatAt || 0) < PAT_COOLDOWN_MS) return 'cooldown';
  state.lastPatAt = now;
  state.happy = Math.min(MAX_HEARTS, state.happy + 1);
  return 'ok';
}

export function cleanPoop(state) {
  if (state.dead || state.poops === 0) return 'unavailable';
  state.poops = 0;
  state.poopFullTicks = 0;
  return 'ok';
}

export function giveMedicine(state) {
  if (state.dead || !state.sick) return 'unavailable';
  state.sick = false;
  state.sickTicks = 0;
  state.sickMistakeGiven = false;
  return 'ok';
}

export function toggleLight(state) {
  if (state.dead) return 'unavailable';
  state.lightsOff = !state.lightsOff;
  if (state.lightsOff && state.asleep) state.lightsOnSleepTicks = 0;
  return state.lightsOff ? 'off' : 'on';
}

export function disciplinePet(state) {
  if (!canAct(state)) return 'unavailable';
  if (!state.callActive) return 'notNeeded';
  state.callActive = false;
  state.callTicks = 0;
  state.discipline = Math.min(100, state.discipline + 25);
  return 'ok';
}

// ミニゲームの結果を反映(won: 5回勝負で3勝以上)
export function applyGameResult(state, won) {
  if (!canAct(state)) return 'unavailable';
  state.weight = Math.max(MIN_WEIGHT, state.weight - 1);
  if (won) state.happy = Math.min(MAX_HEARTS, state.happy + 1);
  return 'ok';
}

// お世話が必要か(アテンション表示)
export function needsAttention(state) {
  if (state.dead || state.stage === 'egg') return false;
  if (state.sick) return true;
  if (state.callActive) return true;
  if (state.poops > 0) return true;
  if (state.asleep) return !state.lightsOff;
  return state.hunger === 0 || state.happy === 0;
}

// 死亡後、次の世代を開始
export function nextGeneration(state, now) {
  return newGame(now, (state.generation || 1) + 1);
}

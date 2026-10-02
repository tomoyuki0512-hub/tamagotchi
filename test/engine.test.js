import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame, catchUp, feedMeal, feedSnack, cleanPoop, giveMedicine,
  toggleLight, disciplinePet, applyGameResult, needsAttention,
  nextGeneration, patPet, updateSleep, TICK_MS, STAGE_BOUNDS, MAX_HEARTS, PAT_COOLDOWN_MS,
  NAP_MS, NAP_INTERVAL_MS,
} from '../js/engine.js';

// 現地時間の指定時刻でタイムスタンプを作る(睡眠判定が現地時間ベースのため)
function at(hour, minute = 0) {
  return new Date(2026, 6, 13, hour, minute).getTime(); // 2026-07-13(固定日)
}

function advance(state, ticks) {
  catchUp(state, state.lastTick + ticks * TICK_MS);
}

test('たまごは1分でふ化してベビーになる', () => {
  const s = newGame(at(10));
  assert.equal(s.stage, 'egg');
  advance(s, 1);
  assert.equal(s.stage, 'baby');
  assert.equal(s.character, 'baby');
  assert.ok(s.events.some(e => e.type === 'hatched'));
});

test('たまごの間はパラメータが減らない', () => {
  const s = newGame(at(10));
  assert.equal(s.stage, 'egg');
  assert.equal(s.hunger, MAX_HEARTS);
  assert.equal(s.poops, 0);
});

test('起きている間におなかとごきげんが減る', () => {
  const s = newGame(at(9));
  advance(s, 10); // ふ化直後: hunger=2, happy=2
  const h0 = s.hunger;
  advance(s, 120);
  assert.ok(s.hunger < h0, 'おなかが減っているはず');
});

test('ごはんでおなか回復・体重増加、満腹なら拒否', () => {
  const s = newGame(at(9));
  advance(s, 10);
  const w = s.weight;
  assert.equal(feedMeal(s), 'ok');
  assert.equal(s.weight, w + 1);
  s.hunger = MAX_HEARTS;
  assert.equal(feedMeal(s), 'refused');
});

test('おやつでごきげん回復・体重+2', () => {
  const s = newGame(at(9));
  advance(s, 10);
  s.happy = 1;
  const w = s.weight;
  assert.equal(feedSnack(s), 'ok');
  assert.equal(s.happy, 2);
  assert.equal(s.weight, w + 2);
});

test('時間経過でうんちが出て、掃除できる', () => {
  const s = newGame(at(9));
  advance(s, 5 + 180); // ふ化後3時間(9:05〜12:05、ずっと起きている)
  assert.ok(s.poops >= 1, 'うんちが出ているはず');
  assert.equal(cleanPoop(s), 'ok');
  assert.equal(s.poops, 0);
});

test('空腹を90分放置すると病気になり、くすりで治る', () => {
  const s = newGame(at(6));
  advance(s, 10);
  s.hunger = 0;
  advance(s, 95);
  assert.equal(s.sick, true);
  assert.equal(giveMedicine(s), 'ok');
  assert.equal(s.sick, false);
});

test('病気を6時間放置しても死なず「よわっている」状態になる', () => {
  const s = newGame(at(6));
  advance(s, 10);
  s.hunger = 0;
  advance(s, 90 + 360);
  assert.equal(s.dead, false, '放置では死なない');
  assert.equal(s.weak, true);
  assert.ok(s.events.some(e => e.type === 'gotWeak'));
});

test('よわっていても看病すれば元気に戻る', () => {
  const s = newGame(at(6));
  advance(s, 10);
  s.hunger = 0;
  advance(s, 90 + 360);
  assert.equal(s.weak, true);

  giveMedicine(s);
  cleanPoop(s);
  while (feedMeal(s) === 'ok');
  advance(s, 1);
  assert.equal(s.weak, false);
  assert.ok(s.events.some(e => e.type === 'recovered'));
});

test('空腹を12時間放置しても死なずによわるだけ', () => {
  const s = newGame(at(6));
  advance(s, 10);
  s.hunger = 0;
  advance(s, 720 + 5);
  assert.equal(s.dead, false);
  assert.equal(s.weak, true);
});

test('太りすぎると病気になる', () => {
  const s = newGame(at(9));
  advance(s, 10);
  for (let i = 0; i < 30; i++) feedSnack(s); // 体重 +60
  advance(s, 1);
  assert.equal(s.sick, true);
});

test('夜はときどき30秒だけねむる', () => {
  const s = newGame(at(19, 30));
  catchUp(s, at(20, 10)); // ベビーの夜は20時から
  const night = at(20, 10);

  // 昼間はねむらない
  s.asleep = false; s.napUntil = null; s.napCooldownUntil = null;
  assert.equal(updateSleep(s, at(12, 0)), false);
  assert.equal(s.asleep, false);

  // 夜になるとねむる
  assert.equal(updateSleep(s, night), true);
  assert.equal(s.asleep, true);
  assert.ok(s.events.some(e => e.type === 'fellAsleep'));

  // 30秒たつ前はまだねている
  updateSleep(s, night + 29 * 1000);
  assert.equal(s.asleep, true);

  // 30秒で目が覚める
  assert.equal(updateSleep(s, night + NAP_MS), true);
  assert.equal(s.asleep, false);
  assert.ok(s.events.some(e => e.type === 'wokeUp'));
});

test('ねむりから覚めたあとは、しばらくねむらない(遊びを邪魔しない)', () => {
  const s = newGame(at(19, 30));
  catchUp(s, at(20, 10));
  const night = at(20, 10);

  s.asleep = false; s.napUntil = null; s.napCooldownUntil = null;
  updateSleep(s, night);              // ねむる
  updateSleep(s, night + NAP_MS);     // 起きる
  assert.equal(s.asleep, false);

  // インターバル中はねむらない
  updateSleep(s, night + NAP_MS + 60 * 1000);
  assert.equal(s.asleep, false, '1分後はまだ起きている');

  // インターバルを過ぎたらまたねむる
  updateSleep(s, night + NAP_MS + NAP_INTERVAL_MS);
  assert.equal(s.asleep, true);
});

test('起きると電気はついた状態に戻る', () => {
  const s = newGame(at(19, 30));
  catchUp(s, at(20, 10));
  const night = at(20, 10);

  s.asleep = false; s.napUntil = null; s.napCooldownUntil = null;
  updateSleep(s, night);
  toggleLight(s);
  assert.equal(s.lightsOff, true);
  updateSleep(s, night + NAP_MS);
  assert.equal(s.lightsOff, false);
});

test('ねむっていてもおなかは減り続ける(30秒なので実質影響なし)', () => {
  const s = newGame(at(20, 30));
  catchUp(s, at(20, 40));
  const h = s.hunger;
  catchUp(s, at(23, 30)); // 3時間
  assert.ok(s.hunger < h, '夜でも時間は進む');
});

test('たまご・死亡中はねむらない', () => {
  const egg = newGame(at(21));
  assert.equal(updateSleep(egg, at(21)), false);
  assert.equal(egg.asleep, false);

  const dead = newGame(at(21));
  catchUp(dead, at(21, 10));
  dead.dead = true;
  dead.asleep = true;
  assert.equal(updateSleep(dead, at(21, 10)), true);
  assert.equal(dead.asleep, false);
});

test('成長: ベビー→こども→ティーン→アダルト', () => {
  const s = newGame(at(9));
  // 減衰で死なないよう、世話をしながら進める
  const feed = () => {
    while (feedMeal(s) === 'ok');
    s.happy = MAX_HEARTS;
    cleanPoop(s);
    s.weight = 20;
    if (s.sick) giveMedicine(s);
  };
  const step = (ticks) => {
    for (let i = 0; i < ticks; i += 30) { advance(s, 30); feed(); }
  };
  step(STAGE_BOUNDS.baby + 10);
  assert.equal(s.stage, 'child');
  step(STAGE_BOUNDS.child - STAGE_BOUNDS.baby);
  assert.equal(s.stage, 'teen');
  step(STAGE_BOUNDS.teen - STAGE_BOUNDS.child);
  assert.equal(s.stage, 'adult');
  assert.equal(s.dead, false);
});

test('進化は1日1回のペース(1日目こども・2日目ティーン・3日目アダルト)', () => {
  const DAY = 1440;
  assert.equal(STAGE_BOUNDS.baby, DAY, '1日ちょうどでこども');
  assert.equal(STAGE_BOUNDS.child, 2 * DAY, '2日ちょうどでティーン');
  assert.equal(STAGE_BOUNDS.teen, 3 * DAY, '3日ちょうどでアダルト');
});

test('良いお世話ならきらりんに進化', () => {
  const s = newGame(at(9));
  s.discipline = 100;
  s.careMistakes = 0;
  // ティーン期の終わり直前まで一気に(世話をしながら)
  const feed = () => {
    while (feedMeal(s) === 'ok');
    s.happy = MAX_HEARTS;
    cleanPoop(s);
    s.weight = 20;
    if (s.sick) giveMedicine(s);
    s.careMistakes = 0;
    if (s.callActive) disciplinePet(s);
    s.discipline = 100;
  };
  for (let i = 0; i < STAGE_BOUNDS.teen + 10; i += 30) { advance(s, 30); feed(); }
  assert.equal(s.stage, 'adult');
  assert.equal(s.character, 'adult_good');
});

test('世話が悪いとだららんに進化', () => {
  const s = newGame(at(9));
  const feed = () => {
    while (feedMeal(s) === 'ok');
    s.happy = MAX_HEARTS;
    cleanPoop(s);
    s.weight = 20;
    if (s.sick) giveMedicine(s);
  };
  for (let i = 0; i < STAGE_BOUNDS.teen + 10; i += 30) { advance(s, 30); feed(); }
  assert.equal(s.stage, 'adult');
  // しつけ0のまま育てたので、なまけ系になる
  assert.equal(s.character, 'adult_bad');
});

test('しつけ: 呼び出しに応えると discipline が上がる', () => {
  const s = newGame(at(9));
  advance(s, 10);
  assert.equal(disciplinePet(s), 'notNeeded');
  s.stage = 'child';
  s.character = 'child';
  s.callActive = true;
  assert.equal(disciplinePet(s), 'ok');
  assert.equal(s.discipline, 25);
});

test('ミニゲームで体重が減り、勝つとごきげんが上がる', () => {
  const s = newGame(at(9));
  advance(s, 10);
  s.weight = 30;
  s.happy = 2;
  applyGameResult(s, true);
  assert.equal(s.weight, 29);
  assert.equal(s.happy, 3);
});

test('アテンション: 空腹・うんち・病気・呼び出しで点灯', () => {
  const s = newGame(at(9));
  advance(s, 10);
  s.hunger = 2; s.happy = 2;
  assert.equal(needsAttention(s), false);
  s.poops = 1;
  assert.equal(needsAttention(s), true);
  s.poops = 0;
  s.sick = true;
  assert.equal(needsAttention(s), true);
});

test('数日放置して復帰しても生きている(よわっているだけ)', () => {
  const s = newGame(at(9));
  catchUp(s, at(9) + 3 * 24 * 60 * TICK_MS); // 3日後に復帰
  assert.equal(s.dead, false, '3日放置でも死なない');
  assert.equal(s.weak, true);
});

test('とても長く放置すると天寿をまっとうする', () => {
  const s = newGame(at(9));
  const processed = catchUp(s, at(9) + 60 * 24 * 60 * TICK_MS); // 60日後に復帰
  assert.equal(s.dead, true);
  assert.equal(s.deathCause, 'oldAge', '死因は寿命のみ');
  assert.ok(processed < 40 * 24 * 60, '死亡後はシミュレートを打ち切る');
});

test('次の世代は世代番号が増える', () => {
  const s = newGame(at(9));
  s.dead = true;
  const s2 = nextGeneration(s, at(10));
  assert.equal(s2.generation, 2);
  assert.equal(s2.stage, 'egg');
});

test('なでるとごきげんが上がる', () => {
  const s = newGame(at(9));
  advance(s, 10);
  s.happy = 1;
  assert.equal(patPet(s, s.lastTick), 'ok');
  assert.equal(s.happy, 2);
});

test('なでるのは3分に1回だけ効果がある(連打対策)', () => {
  const s = newGame(at(9));
  advance(s, 10);
  s.happy = 1;
  const t = s.lastTick;
  assert.equal(patPet(s, t), 'ok');
  assert.equal(s.happy, 2);
  assert.equal(patPet(s, t + 1000), 'cooldown');
  assert.equal(s.happy, 2);
  assert.equal(patPet(s, t + PAT_COOLDOWN_MS + 1), 'ok');
  assert.equal(s.happy, 3);
});

test('ごきげんが満タンでもなでられる(上限で頭打ち)', () => {
  const s = newGame(at(9));
  advance(s, 10);
  s.happy = MAX_HEARTS;
  assert.equal(patPet(s, s.lastTick), 'ok');
  assert.equal(s.happy, MAX_HEARTS);
});

test('ねむっている間になでてもごきげんは変わらない', () => {
  const s = newGame(at(20, 30));
  catchUp(s, at(20, 40));
  updateSleep(s, at(20, 40)); // 夜なのでねむる
  assert.equal(s.asleep, true);
  const h = s.happy;
  assert.equal(patPet(s, s.lastTick), 'asleep');
  assert.equal(s.happy, h);
});

test('たまごと死亡状態はなでても反応しない', () => {
  const egg = newGame(at(9));
  assert.equal(patPet(egg, egg.lastTick), 'unavailable');

  const s = newGame(at(9));
  advance(s, 10);
  s.dead = true;
  assert.equal(patPet(s, s.lastTick), 'unavailable');
});

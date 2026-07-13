import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame, catchUp, feedMeal, feedSnack, cleanPoop, giveMedicine,
  toggleLight, disciplinePet, applyGameResult, needsAttention,
  nextGeneration, TICK_MS, STAGE_BOUNDS, MAX_HEARTS,
} from '../js/engine.js';

// 現地時間の指定時刻でタイムスタンプを作る(睡眠判定が現地時間ベースのため)
function at(hour, minute = 0) {
  return new Date(2026, 6, 13, hour, minute).getTime(); // 2026-07-13(固定日)
}

function advance(state, ticks) {
  catchUp(state, state.lastTick + ticks * TICK_MS);
}

test('たまごは5分でふ化してベビーになる', () => {
  const s = newGame(at(10));
  advance(s, 4);
  assert.equal(s.stage, 'egg');
  advance(s, 1);
  assert.equal(s.stage, 'baby');
  assert.equal(s.character, 'baby');
  assert.ok(s.events.some(e => e.type === 'hatched'));
});

test('たまごの間はパラメータが減らない', () => {
  const s = newGame(at(10));
  advance(s, 4);
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

test('病気を6時間放置すると死ぬ', () => {
  const s = newGame(at(6));
  advance(s, 10);
  s.hunger = 0;
  advance(s, 90 + 360);
  assert.equal(s.dead, true);
  assert.equal(s.deathCause, 'sickness');
});

test('太りすぎると病気になる', () => {
  const s = newGame(at(9));
  advance(s, 10);
  for (let i = 0; i < 30; i++) feedSnack(s); // 体重 +60
  advance(s, 1);
  assert.equal(s.sick, true);
});

test('夜になると寝て、朝起きる。電気を消し忘れるとお世話ミス', () => {
  const s = newGame(at(19, 30)); // 19:35 ふ化(ベビー期は1時間)
  catchUp(s, at(19, 40));
  assert.equal(s.asleep, false);
  catchUp(s, at(20, 10)); // ベビーは20時就寝
  assert.equal(s.asleep, true);
  const m = s.careMistakes;
  catchUp(s, at(20, 32)); // 電気つけっぱなしで30分以上
  assert.equal(s.careMistakes, m + 1);
  // 翌朝9時に起きる(その頃にはこどもに進化している)
  catchUp(s, new Date(2026, 6, 14, 9, 5).getTime());
  assert.equal(s.asleep, false);
});

test('寝ている間はおなかが減らない(消灯時)', () => {
  const s = newGame(at(20, 30)); // 20:35 ふ化 → ベビーは即就寝
  catchUp(s, at(20, 40));
  assert.equal(s.asleep, true);
  toggleLight(s);
  const h = s.hunger;
  catchUp(s, at(23, 0));
  assert.equal(s.hunger, h);
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

test('長期放置(オフライン復帰)でも破綻せず死亡まで進む', () => {
  const s = newGame(at(9));
  const processed = catchUp(s, at(9) + 60 * 24 * 60 * TICK_MS); // 60日後に復帰
  assert.equal(s.dead, true);
  assert.ok(processed < 40 * 24 * 60, '死亡後はシミュレートを打ち切る');
  assert.ok(s.events.some(e => e.type.startsWith('died:')));
});

test('次の世代は世代番号が増える', () => {
  const s = newGame(at(9));
  s.dead = true;
  const s2 = nextGeneration(s, at(10));
  assert.equal(s2.generation, 2);
  assert.equal(s2.stage, 'egg');
});

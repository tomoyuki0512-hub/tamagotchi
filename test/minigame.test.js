import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newMatch, startRound, reveal, resolveTap, resolveTimeout,
  windowMsForRound, ROUNDS, WIN_THRESHOLD,
} from '../js/minigame.js';

test('newMatch は idle 状態で始まる', () => {
  const m = newMatch();
  assert.equal(m.phase, 'idle');
  assert.equal(m.round, 0);
  assert.equal(m.finished, false);
});

test('startRound で waiting になり target が決まる', () => {
  const m = newMatch();
  startRound(m);
  assert.equal(m.phase, 'waiting');
  assert.ok(m.target === 'left' || m.target === 'right');
});

test('waiting 中のタップはフライングで失敗になる', () => {
  const m = newMatch();
  startRound(m);
  const target = m.target;
  resolveTap(m, target); // 正しい側でも合図前なら失敗
  assert.equal(m.lastResult, false);
  assert.equal(m.wins, 0);
  assert.equal(m.round, 1);
  assert.equal(m.phase, 'result');
});

test('reveal は waiting からしか active にならない(二重発火防止)', () => {
  const m = newMatch();
  startRound(m);
  reveal(m);
  assert.equal(m.phase, 'active');
  // すでに active な状態で reveal を呼んでも何も壊れない
  reveal(m);
  assert.equal(m.phase, 'active');

  const m2 = newMatch();
  reveal(m2); // idle のまま reveal しても遷移しない
  assert.equal(m2.phase, 'idle');
});

test('active 中に正しい側をタップすると成功', () => {
  const m = newMatch();
  startRound(m);
  reveal(m);
  resolveTap(m, m.target);
  assert.equal(m.lastResult, true);
  assert.equal(m.wins, 1);
});

test('active 中に間違った側をタップすると失敗', () => {
  const m = newMatch();
  startRound(m);
  reveal(m);
  const wrong = m.target === 'left' ? 'right' : 'left';
  resolveTap(m, wrong);
  assert.equal(m.lastResult, false);
  assert.equal(m.wins, 0);
});

test('resolveTimeout は active のときだけ失敗として確定する', () => {
  const m = newMatch();
  startRound(m);
  resolveTimeout(m); // waiting 中のタイムアウトは無視(タイマー競合対策)
  assert.equal(m.phase, 'waiting');
  assert.equal(m.round, 0);

  reveal(m);
  resolveTimeout(m);
  assert.equal(m.lastResult, false);
  assert.equal(m.phase, 'result');
  assert.equal(m.round, 1);
});

test('タップ済みラウンドへの遅延タイムアウトは無視される(二重確定防止)', () => {
  const m = newMatch();
  startRound(m);
  reveal(m);
  resolveTap(m, m.target); // 先にタップで成功確定
  assert.equal(m.wins, 1);
  resolveTimeout(m); // 後から来た古いタイマーは無視されるべき
  assert.equal(m.wins, 1);
  assert.equal(m.round, 1);
});

test('windowMsForRound はラウンドが進むほど短くなる', () => {
  const times = Array.from({ length: ROUNDS }, (_, i) => windowMsForRound(i));
  for (let i = 1; i < times.length; i++) {
    assert.ok(times[i] < times[i - 1]);
  }
});

test('5ラウンド後、3勝以上でクリア', () => {
  const m = newMatch();
  for (let i = 0; i < ROUNDS; i++) {
    startRound(m);
    reveal(m);
    resolveTap(m, i < WIN_THRESHOLD ? m.target : (m.target === 'left' ? 'right' : 'left'));
  }
  assert.equal(m.finished, true);
  assert.equal(m.wins, WIN_THRESHOLD);
  assert.equal(m.won, true);
});

test('5ラウンド後、3勝未満なら敗北', () => {
  const m = newMatch();
  for (let i = 0; i < ROUNDS; i++) {
    startRound(m);
    reveal(m);
    resolveTap(m, m.target === 'left' ? 'right' : 'left'); // 全部わざと外す
  }
  assert.equal(m.finished, true);
  assert.equal(m.wins, 0);
  assert.equal(m.won, false);
});

// main.js — 起動・画面遷移・入力・ゲームループ

import * as E from './engine.js';
import { setupCanvas, renderScene } from './render.js';
import { saveGame, loadGame, clearGame, loadSettings, saveSettings, loadRecords, saveRecords, loadPlaySession, savePlaySession } from './storage.js';
import * as snd from './sound.js';
import * as MG from './minigame.js';
import * as BT from './breaktimer.js';

let state;
let settings;
let records;
let playSession;
let ctx;
let frame = 0;
let overlay = null;        // 'meal' | 'snack' | null(食事アニメ)
let overlayUntil = 0;
let selectedIcon = -1;     // A/B ボタン用の選択位置
let match = null;          // ミニゲームの進行状態
let prevAttention = false;
let deathShown = false;
let msgTimer = null;
let patting = false;       // キャラをなでた直後のバウンド演出フラグ
let pattingUntil = 0;
let pattingHeart = false;  // ハート演出(実際にごきげんが上がった時だけ)

const $ = (sel) => document.querySelector(sel);
const iconButtons = () => [...document.querySelectorAll('.icon-btn[data-action]')];

// ---- 表示用テキスト ----

const EVENT_TEXT = {
  hatched: 'たまごが かえった!',
  'evolved:child': 'まめっこに せいちょうした!',
  'evolved:teen': 'ぴよたんに せいちょうした!',
  'evolved:adult_good': 'きらりんに しんかした!',
  'evolved:adult_normal': 'もちすけに しんかした!',
  'evolved:adult_bad': 'だららんに しんかした…',
  gotSick: 'びょうきに なっちゃった…',
  pooped: 'うんちを した',
  fellAsleep: 'ねむった zzz',
  wokeUp: 'めが さめた!',
  sleptWithLights: 'でんきが ついたままで ねむれない…',
  disciplineCall: 'よんでいる! (しつけのチャンス)',
  callIgnored: 'よんだのに こなかった…',
  'died:sickness': 'びょうきで ほしに かえった…',
  'died:hunger': 'おなかがすいて ほしに かえった…',
  'died:oldAge': 'てんじゅを まっとうした',
};

const DEATH_TEXT = {
  sickness: 'びょうきの おせわを わすれてしまった…',
  hunger: 'おなかを すかせたまま だった…',
  oldAge: 'ながいきして てんじゅを まっとうした!',
};

function charName() {
  return (E.CHARACTERS[state.character] || E.CHARACTERS.egg).name;
}

// ---- LCD 上のトースト ----

function showMsg(text, ms = 1800) {
  const el = $('#lcd-message');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

// ---- モーダル ----

function openModal(html) {
  const wasHidden = $('#modal-overlay').classList.contains('hidden');
  $('#modal-content').innerHTML = html;
  $('#modal-overlay').classList.remove('hidden');
  if (wasHidden) {
    // 新規に開いた時だけポップイン演出(ミニゲームのラウンド毎の再描画では発火させない)
    const box = $('#modal-box');
    box.classList.remove('pop');
    void box.offsetWidth;
    box.classList.add('pop');
  }
  return $('#modal-content');
}

function closeModal() {
  $('#modal-overlay').classList.add('hidden');
  $('#modal-content').innerHTML = '';
  match = null;
  stopGameTimers();
}

function modalOpen() {
  return !$('#modal-overlay').classList.contains('hidden');
}

// ---- テーマ ----

function applyTheme() {
  document.body.className = settings.theme === 'modern' ? 'theme-modern' : 'theme-retro';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = settings.theme === 'modern' ? '#ffe9f2' : '#2b2b33';
}

// ---- アクション ----

function canInteract() {
  return !state.dead && state.stage !== 'egg' && !state.asleep;
}

function doFeed() {
  if (!canInteract()) return showMsg(feedBlockedMsg());
  const c = openModal(`
    <h2>なにを あげる?</h2>
    <div class="modal-buttons">
      <button class="m-btn" data-food="meal">🍚 ごはん (おなか +1)</button>
      <button class="m-btn" data-food="snack">🍰 おやつ (ごきげん +1 / ふとりやすい)</button>
      <button class="m-btn secondary" data-close>やめる</button>
    </div>`);
  c.querySelectorAll('[data-food]').forEach((b) => b.addEventListener('click', () => {
    const kind = b.dataset.food;
    const result = kind === 'meal' ? E.feedMeal(state) : E.feedSnack(state);
    closeModal();
    if (result === 'refused') {
      snd.beepCancel();
      showMsg('おなかいっぱい みたい');
    } else if (result === 'ok') {
      snd.beepConfirm();
      overlay = kind;
      overlayUntil = Date.now() + 1600;
      showMsg(kind === 'meal' ? 'もぐもぐ…' : 'おやつに おおよろこび!');
    }
    afterAction();
  }));
  c.querySelector('[data-close]').addEventListener('click', () => { snd.beepCancel(); closeModal(); });
}

function feedBlockedMsg() {
  if (state.dead) return '…';
  if (state.stage === 'egg') return 'まだ たまごだよ';
  if (state.asleep) return 'いまは ねむっているよ';
  return 'いまは できないよ';
}

function doLight() {
  if (state.dead) return;
  const r = E.toggleLight(state);
  snd.beep();
  showMsg(r === 'off' ? 'でんきを けした' : 'でんきを つけた');
  afterAction();
}

let matchHistory = [];
let matchReactionTimes = []; // ヒット時の反応時間(ms)。ヒット以外は null
let revealAt = 0;            // 合図(reveal)が出た時刻
let gameRevealTimer = null;
let gameWindowTimer = null;
let gameAdvanceTimer = null;

function stopGameTimers() {
  clearTimeout(gameRevealTimer);
  clearTimeout(gameWindowTimer);
  clearTimeout(gameAdvanceTimer);
  gameRevealTimer = gameWindowTimer = gameAdvanceTimer = null;
}

function doGame() {
  if (!canInteract()) return showMsg(feedBlockedMsg());
  match = MG.newMatch();
  matchHistory = [];
  matchReactionTimes = [];
  runRound();
}

// 1ラウンド開始: 「よーい」→ ランダムな時間後に合図(reveal)→ 制限時間でタイムアウト
function runRound() {
  MG.startRound(match);
  renderGameModal();
  const delay = MG.REVEAL_DELAY_MIN + Math.random() * (MG.REVEAL_DELAY_MAX - MG.REVEAL_DELAY_MIN);
  gameRevealTimer = setTimeout(() => {
    MG.reveal(match);
    revealAt = Date.now();
    renderGameModal();
    gameWindowTimer = setTimeout(handleRoundTimeout, MG.windowMsForRound(match.round));
  }, delay);
}

function handleGuess(choice) {
  if (!match || match.finished || match.phase === 'result' || match.phase === 'idle') return;
  const reason = match.phase === 'waiting' ? 'early' : (choice === match.target ? 'hit' : 'wrong');
  const reactionMs = reason === 'hit' ? Date.now() - revealAt : null;
  stopGameTimers();
  MG.resolveTap(match, choice);
  matchHistory[match.round - 1] = match.lastResult;
  matchReactionTimes[match.round - 1] = reactionMs;
  finishRoundUI(reason, reactionMs);
}

function handleRoundTimeout() {
  stopGameTimers();
  if (!match || match.phase !== 'active') return;
  MG.resolveTimeout(match);
  matchHistory[match.round - 1] = match.lastResult;
  matchReactionTimes[match.round - 1] = null;
  finishRoundUI('timeout', null);
}

const ROUND_RESULT_TEXT = {
  wrong: 'ちがう… ×',
  early: 'はやすぎ! ×',
  timeout: 'おそい… ×',
};

function finishRoundUI(reason, reactionMs) {
  (match.lastResult ? snd.beepConfirm : snd.beepCancel)();
  const text = reason === 'hit' ? `せいかい! ○ (${reactionMs}ms)` : ROUND_RESULT_TEXT[reason];
  renderGameModal(text);
  if (match.finished) {
    const won = match.won;
    E.applyGameResult(state, won);
    if (won) snd.jingleWin();
    afterAction();
    gameAdvanceTimer = setTimeout(() => renderGameResult(won), 900);
  } else {
    gameAdvanceTimer = setTimeout(runRound, 900);
  }
}

// resultText を渡すとその文言を、渡さなければ match.phase から表示内容を組み立てる
function renderGameModal(resultText) {
  const dots = Array.from({ length: MG.ROUNDS }, (_, i) => (
    i >= matchHistory.length ? '・' : (matchHistory[i] ? '○' : '×')
  )).join('');

  let status = resultText;
  let leftExtra = '';
  let rightExtra = '';
  let barHtml = '';

  if (!status) {
    if (match.phase === 'waiting') {
      status = match.round === 0 ? 'ひかったほうを すぐ おそう!' : 'よーい…';
      leftExtra = rightExtra = ' waiting';
    } else if (match.phase === 'active') {
      status = match.target === 'left' ? '◀ ひだり!' : 'みぎ ▶!';
      if (match.target === 'left') leftExtra = ' lit'; else rightExtra = ' lit';
      barHtml = '<div class="bar wide" id="game-bar"><i id="game-bar-fill"></i></div>';
    }
  }

  const c = openModal(`
    <h2>みぎひだり はんしゃゲーム (${match.round}/${MG.ROUNDS})</h2>
    <div id="game-status">${status}</div>
    ${barHtml}
    <div class="modal-buttons row">
      <button class="m-btn big${leftExtra}" data-guess="left">◀ ひだり</button>
      <button class="m-btn big${rightExtra}" data-guess="right">みぎ ▶</button>
    </div>
    <div id="game-rounds">${dots}</div>
    <div class="modal-buttons">
      <button class="m-btn secondary" data-close>やめる</button>
    </div>`);

  c.querySelectorAll('[data-guess]').forEach((b) => b.addEventListener('click', () => handleGuess(b.dataset.guess)));
  c.querySelector('[data-close]').addEventListener('click', () => { snd.beepCancel(); closeModal(); });

  if (match.phase === 'active') startBarAnimation(MG.windowMsForRound(match.round));
}

// タイミングバーを右から左へ制限時間ぶんかけて縮める
function startBarAnimation(durationMs) {
  const fill = document.getElementById('game-bar-fill');
  if (!fill) return;
  fill.style.transition = 'none';
  fill.style.width = '100%';
  void fill.offsetWidth; // 強制リフローしてから transition を効かせる
  fill.style.transition = `width ${durationMs}ms linear`;
  fill.style.width = '0%';
}

function renderGameResult(won) {
  const wins = match.wins;
  const hitTimes = matchReactionTimes.filter((t) => t != null);
  const avg = hitTimes.length ? Math.round(hitTimes.reduce((a, b) => a + b, 0) / hitTimes.length) : null;
  const rank = avg == null ? null : avg < 350 ? 'S' : avg < 500 ? 'A' : avg < 650 ? 'B' : 'C';

  records.gamesPlayed++;
  if (won) records.gamesWon++;
  let bestUpdated = false;
  if (won && avg != null && (records.bestAvgReactionMs == null || avg < records.bestAvgReactionMs)) {
    records.bestAvgReactionMs = avg;
    bestUpdated = true;
  }
  saveRecords(records);

  const avgLine = avg != null ? `へいきん はんのう: ${avg}ms (${rank}ランク)<br>` : '';
  const bestLine = bestUpdated ? '🏆 じこベスト こうしん!<br>' : '';

  const c = openModal(`
    <h2>${won ? '🎉 かち!' : 'まけ…'}</h2>
    <div id="game-status">${wins}かい せいかい した!<br>${avgLine}${bestLine}${won ? 'ごきげんアップ &amp; うんどうに なった!' : 'でも いいうんどうに なった!'}</div>
    <div class="modal-buttons">
      <button class="m-btn" data-close>おわる</button>
    </div>`);
  c.querySelector('[data-close]').addEventListener('click', () => { snd.beep(); closeModal(); });
}

function doMedicine() {
  if (state.dead) return;
  const r = E.giveMedicine(state);
  if (r === 'ok') {
    snd.beepConfirm();
    showMsg('おくすりで げんきに なった!');
  } else {
    snd.beepCancel();
    showMsg('いまは おくすり いらないみたい');
  }
  afterAction();
}

function doClean() {
  const r = E.cleanPoop(state);
  if (r === 'ok') {
    snd.beepConfirm();
    showMsg('ピカピカに なった!');
  } else {
    snd.beepCancel();
    showMsg('そうじは いらないみたい');
  }
  afterAction();
}

function doMeter() {
  snd.beep();
  const hearts = (n) => '♥'.repeat(n) + '♡'.repeat(E.MAX_HEARTS - n);
  const days = E.ageDays(state, Date.now());
  openModal(`
    <h2>${charName()} のようす</h2>
    <div class="meter-row"><span>なまえ</span><b>${charName()}</b></div>
    <div class="meter-row"><span>たいちょう</span><b>${state.sick ? 'びょうき 🤒' : 'げんき'}</b></div>
    <div class="meter-row"><span>ようす</span><b>${state.asleep ? 'ねている 💤' : 'おきてる'}</b></div>
    <div class="meter-row"><span>おなか</span><span class="hearts">${hearts(state.hunger)}</span></div>
    <div class="meter-row"><span>ごきげん</span><span class="hearts">${hearts(state.happy)}</span></div>
    <div class="meter-row"><span>しつけ</span><span class="bar"><i style="width:${state.discipline}%"></i></span></div>
    <div class="meter-row"><span>たいじゅう</span><b>${state.weight} g</b></div>
    <div class="meter-row"><span>ねんれい</span><b>${days} さい(にち)</b></div>
    <div class="meter-row"><span>せだい</span><b>だい ${state.generation} せだい</b></div>
    <div class="modal-buttons">
      <button class="m-btn" data-close>とじる</button>
    </div>`).querySelector('[data-close]').addEventListener('click', () => { snd.beep(); closeModal(); });
}

function doDiscipline() {
  if (!canInteract()) return showMsg(feedBlockedMsg());
  const r = E.disciplinePet(state);
  if (r === 'ok') {
    snd.beepConfirm();
    showMsg('しつけ できた! えらい!');
  } else {
    snd.beepCancel();
    showMsg('いまは しからなくて よさそう');
  }
  afterAction();
}

const ACTIONS = {
  feed: doFeed,
  light: doLight,
  game: doGame,
  medicine: doMedicine,
  clean: doClean,
  meter: doMeter,
  discipline: doDiscipline,
};

function afterAction() {
  saveGame(state);
  updateHUD();
  draw();
}

// ---- 設定 ----

function openSettings() {
  snd.beep();
  const c = openModal(`
    <h2>せってい</h2>
    <div class="setting-row">
      <span>きせかえ</span>
      <span class="seg">
        <button data-theme="retro" class="${settings.theme === 'retro' ? 'on' : ''}">レトロ</button>
        <button data-theme="modern" class="${settings.theme === 'modern' ? 'on' : ''}">モダン</button>
      </span>
    </div>
    <div class="setting-row">
      <span>おと</span>
      <span class="seg">
        <button data-sound="on" class="${settings.sound ? 'on' : ''}">ON</button>
        <button data-sound="off" class="${settings.sound ? '' : 'on'}">OFF</button>
      </span>
    </div>
    <div class="section-label">きろく</div>
    <div class="meter-row"><span>そだてた せだい</span><b>${records.generations}</b></div>
    <div class="meter-row"><span>なでた かいすう</span><b>${records.totalPats}</b></div>
    <div class="meter-row"><span>ゲームの せいせき</span><b>${records.gamesWon} / ${records.gamesPlayed} かち</b></div>
    <div class="meter-row"><span>さいちょう じゅみょう</span><b>${records.longestLifeDays} にち</b></div>
    <div class="meter-row"><span>はんしゃベスト</span><b>${records.bestAvgReactionMs != null ? records.bestAvgReactionMs + 'ms' : 'まだ なし'}</b></div>
    <div class="modal-buttons">
      <button class="m-btn secondary" data-reset>さいしょから そだてなおす</button>
      <button class="m-btn" data-close>とじる</button>
    </div>
    <p class="about">ぴこっち v1.0 — むかしなつかしの携帯育成ゲーム風PWA。<br>
    ホームがめんに ついかすると アプリみたいに あそべるよ。<br>
    アプリを とじているあいだも じかんは すすむよ。</p>`);
  c.querySelectorAll('[data-theme]').forEach((b) => b.addEventListener('click', () => {
    settings.theme = b.dataset.theme;
    saveSettings(settings);
    applyTheme();
    openSettings(); // 表示を更新
  }));
  c.querySelectorAll('[data-sound]').forEach((b) => b.addEventListener('click', () => {
    settings.sound = b.dataset.sound === 'on';
    saveSettings(settings);
    snd.setSoundEnabled(settings.sound);
    snd.beep();
    openSettings();
  }));
  c.querySelector('[data-reset]').addEventListener('click', () => {
    const c2 = openModal(`
      <h2>ほんとうに そだてなおす?</h2>
      <p style="text-align:center">いまの ${charName()} とは おわかれに なるよ。</p>
      <div class="modal-buttons">
        <button class="m-btn" data-yes>そだてなおす</button>
        <button class="m-btn secondary" data-no>やめる</button>
      </div>`);
    c2.querySelector('[data-yes]').addEventListener('click', () => {
      clearGame();
      state = E.newGame(Date.now(), 1);
      deathShown = false;
      saveGame(state);
      snd.beepConfirm();
      closeModal();
      showWelcome();
      updateHUD();
      draw();
    });
    c2.querySelector('[data-no]').addEventListener('click', () => { snd.beepCancel(); closeModal(); });
  });
  c.querySelector('[data-close]').addEventListener('click', () => { snd.beep(); closeModal(); });
}

// ---- 死亡・世代交代 ----

function showDeathModal() {
  deathShown = true;
  const days = E.ageDays(state, state.lastTick);
  records.generations++;
  records.longestLifeDays = Math.max(records.longestLifeDays, days);
  saveRecords(records);
  const c = openModal(`
    <h2>${charName()} は ほしに かえった…</h2>
    <p style="text-align:center; line-height:1.8">
      ${DEATH_TEXT[state.deathCause] || ''}<br>
      いっしょに すごした ひかず: <b>${days} にち</b><br>
      だい ${state.generation} せだい
    </p>
    <div class="modal-buttons">
      <button class="m-btn" data-next>あたらしい たまごを むかえる</button>
    </div>`);
  c.querySelector('[data-next]').addEventListener('click', () => {
    state = E.nextGeneration(state, Date.now());
    deathShown = false;
    saveGame(state);
    snd.beepConfirm();
    closeModal();
    showWelcome();
    updateHUD();
    draw();
  });
}

function showWelcome() {
  showMsg('たまごが とどいた! 1ぷんで うまれるよ', 4000);
}

// ---- 留守中ダイジェスト ----

function showDigest(events, awayMs) {
  const fmt = (ts) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const interesting = events.filter((e) => e.type !== 'pooped' && e.type !== 'fellAsleep' && e.type !== 'wokeUp');
  const poops = events.filter((e) => e.type === 'pooped').length;
  const items = interesting.slice(-8).map((e) => `<li><time>${fmt(e.at)}</time>${EVENT_TEXT[e.type] || e.type}</li>`).join('');
  const hours = Math.round(awayMs / 3600000);
  const c = openModal(`
    <h2>おかえり!(るすばん ${hours >= 24 ? Math.floor(hours / 24) + 'にち' : hours + 'じかん'})</h2>
    <ul class="digest-list">
      ${items || '<li>とくに かわりなし!</li>'}
      ${poops > 0 ? `<li>うんちを ${poops}かい した</li>` : ''}
    </ul>
    <div class="modal-buttons">
      <button class="m-btn" data-close>ようすを みる</button>
    </div>`);
  c.querySelector('[data-close]').addEventListener('click', () => {
    snd.beep();
    closeModal();
    if (state.dead && !deathShown) showDeathModal();
  });
}

// ---- ライブイベント(アプリを開いている間に起きたこと)----

function handleLiveEvents(events) {
  for (const e of events) {
    const text = EVENT_TEXT[e.type];
    if (e.type.startsWith('evolved:') || e.type === 'hatched') {
      snd.jingleEvolve();
      if (text) showMsg(text, 3000);
    } else if (e.type.startsWith('died:')) {
      snd.jingleSad();
    } else if (e.type === 'disciplineCall') {
      snd.beepAttention();
      if (text) showMsg(text, 3000);
    } else if (e.type === 'gotSick') {
      snd.beepAttention();
      if (text) showMsg(text, 3000);
    }
  }
}

// ---- HUD 更新・ゲームループ ----

function updateHUD() {
  $('#gen-label').textContent = `だい${state.generation}せだい`;

  const attention = E.needsAttention(state);
  const icon = $('#attention-icon');
  icon.classList.toggle('on', attention);
  if (attention && !prevAttention) snd.beepAttention();
  prevAttention = attention;

  $('#lights-overlay').classList.toggle('hidden', !state.lightsOff || state.dead);

  if (state.dead && !deathShown && !modalOpen()) showDeathModal();
}

function draw() {
  if (overlay && Date.now() > overlayUntil) overlay = null;
  if (patting && Date.now() > pattingUntil) patting = pattingHeart = false;
  // ごく小さなアイドルバウンス(フレーム切替と同期させ、ピクセルがにじまないよう整数値のみ使う)
  const bounce = !state.asleep && !state.dead && frame === 1 ? 1 : 0;
  renderScene(ctx, state, { frame, theme: settings.theme, overlay, patting, pattingHeart, bounce });
}

function doPat() {
  if (modalOpen()) return;
  const r = E.patPet(state, Date.now());
  if (r === 'unavailable') return;
  if (r === 'asleep') {
    showMsg('ぐっすり ねているよ');
    return;
  }
  patting = true;
  pattingHeart = r === 'ok';
  pattingUntil = Date.now() + 500;
  snd.beep();
  if (r === 'ok') {
    showMsg('なでなで うれしい!');
    records.totalPats++;
    saveRecords(records);
    saveGame(state);
    updateHUD();
  }
  draw();
}

function gameTick() {
  const processed = E.catchUp(state, Date.now());
  if (processed > 0) {
    const events = state.events.splice(0);
    handleLiveEvents(events);
    saveGame(state);
    updateHUD();
  }
}

// ---- 休憩タイマー(5分あそんだら10分操作不能に)----

function blockedByBreak() {
  return BT.isOnBreak(playSession, Date.now());
}

function showBreakOverlay(remainMs) {
  $('#break-overlay').classList.remove('hidden');
  const mm = Math.floor(remainMs / 60000);
  const ss = Math.floor((remainMs % 60000) / 1000);
  $('#break-countdown').textContent = `のこり ${mm}:${String(ss).padStart(2, '0')}`;
}

function hideBreakOverlay() {
  $('#break-overlay').classList.add('hidden');
}

function updatePlayTimer() {
  const now = Date.now();
  const next = BT.tick(playSession, now);
  if (next !== playSession) {
    const enteringBreak = next.breakUntil != null;
    playSession = next;
    savePlaySession(playSession);
    if (enteringBreak) {
      closeModal();
      snd.beepAttention();
    }
  }
  if (BT.isOnBreak(playSession, now)) {
    showBreakOverlay(BT.remainingBreakMs(playSession, now));
  } else {
    hideBreakOverlay();
  }
}

// ---- 入力(アイコン・A/B/C)----

function bindInputs() {
  iconButtons().forEach((btn) => {
    btn.addEventListener('click', () => {
      if (blockedByBreak()) return;
      selectedIcon = -1;
      highlightSelection();
      ACTIONS[btn.dataset.action]();
    });
  });

  $('#btn-settings').addEventListener('click', () => {
    if (blockedByBreak()) return;
    openSettings();
  });

  $('#screen').addEventListener('click', () => {
    if (blockedByBreak()) return;
    doPat();
  });

  $('#btn-a').addEventListener('click', () => {
    if (blockedByBreak() || modalOpen()) return;
    snd.beep();
    selectedIcon = (selectedIcon + 1) % iconButtons().length;
    highlightSelection();
  });

  $('#btn-b').addEventListener('click', () => {
    if (blockedByBreak() || modalOpen()) return;
    if (selectedIcon < 0) return;
    const btn = iconButtons()[selectedIcon];
    selectedIcon = -1;
    highlightSelection();
    ACTIONS[btn.dataset.action]();
  });

  $('#btn-c').addEventListener('click', () => {
    if (blockedByBreak()) return;
    snd.beepCancel();
    if (modalOpen()) { closeModal(); return; }
    selectedIcon = -1;
    highlightSelection();
  });
}

function highlightSelection() {
  iconButtons().forEach((b, i) => b.classList.toggle('selected', i === selectedIcon));
}

// ---- 起動 ----

function init() {
  settings = loadSettings();
  records = loadRecords();
  playSession = loadPlaySession();
  applyTheme();
  snd.setSoundEnabled(settings.sound);

  ctx = setupCanvas($('#screen'));

  const now = Date.now();
  const saved = loadGame();
  if (saved) {
    state = saved;
    const awayMs = now - state.lastTick;
    E.catchUp(state, now);
    const events = state.events.splice(0);
    saveGame(state);
    if (awayMs > 60 * 60 * 1000 && (events.length || state.dead)) {
      showDigest(events, awayMs);
    } else if (state.dead) {
      // ダイジェストなしで死亡していた場合は updateHUD が墓モーダルを出す
    }
  } else {
    state = E.newGame(now, 1);
    saveGame(state);
    showWelcome();
  }

  bindInputs();
  updateHUD();
  updatePlayTimer();
  draw();

  setInterval(gameTick, 1000);           // 1秒ごとに実時間と同期
  setInterval(updatePlayTimer, 1000);    // 5分あそんだら10分休憩
  setInterval(() => { frame ^= 1; draw(); }, 500); // アニメーション

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return; // 保存は tick/アクション毎に済んでいる
    const awayMs = Date.now() - state.lastTick;
    E.catchUp(state, Date.now());
    const events = state.events.splice(0);
    saveGame(state);
    if (awayMs > 60 * 60 * 1000 && (events.length || state.dead)) {
      showDigest(events, awayMs);
    } else {
      handleLiveEvents(events);
    }
    updateHUD();
    updatePlayTimer();
    draw();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW registration failed', e));
  }
}

init();

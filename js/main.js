// main.js — 起動・画面遷移・入力・ゲームループ

import * as E from './engine.js';
import { setupCanvas, renderScene } from './render.js';
import { saveGame, loadGame, clearGame, loadSettings, saveSettings } from './storage.js';
import * as snd from './sound.js';
import * as MG from './minigame.js';

let state;
let settings;
let ctx;
let frame = 0;
let overlay = null;        // 'meal' | 'snack' | null(食事アニメ)
let overlayUntil = 0;
let selectedIcon = -1;     // A/B ボタン用の選択位置
let match = null;          // ミニゲームの進行状態
let prevAttention = false;
let deathShown = false;
let msgTimer = null;
let patting = false;       // キャラをなでた直後の演出中フラグ
let pattingUntil = 0;

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
  $('#modal-content').innerHTML = html;
  $('#modal-overlay').classList.remove('hidden');
  return $('#modal-content');
}

function closeModal() {
  $('#modal-overlay').classList.add('hidden');
  $('#modal-content').innerHTML = '';
  match = null;
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

function doGame() {
  if (!canInteract()) return showMsg(feedBlockedMsg());
  match = MG.newMatch();
  matchHistory = [];
  renderGameModal('どっちに いるかな?');
}

function renderGameModal(status) {
  const dots = Array.from({ length: MG.ROUNDS }, (_, i) => {
    if (i >= match.round) return '・';
    return i < match.round && matchHistory[i] ? '○' : '×';
  }).join('');
  const c = openModal(`
    <h2>かくれんぼゲーム (${match.round}/${MG.ROUNDS})</h2>
    <div id="game-status">${status}</div>
    <div id="game-rounds">${dots}</div>
    <div class="modal-buttons row">
      <button class="m-btn big" data-guess="left">◀ ひだり</button>
      <button class="m-btn big" data-guess="right">みぎ ▶</button>
    </div>
    <div class="modal-buttons">
      <button class="m-btn secondary" data-close>やめる</button>
    </div>`);
  c.querySelectorAll('[data-guess]').forEach((b) => b.addEventListener('click', () => {
    if (!match || match.finished) return;
    MG.guess(match, b.dataset.guess);
    matchHistory[match.round - 1] = match.lastCorrect;
    snd.beep();
    if (match.finished) {
      const won = match.won;
      E.applyGameResult(state, won);
      if (won) snd.jingleWin(); else snd.beepCancel();
      renderGameResult(won);
      afterAction();
    } else {
      renderGameModal(match.lastCorrect ? 'あたり! ○' : 'はずれ… ×');
    }
  }));
  c.querySelector('[data-close]').addEventListener('click', () => { snd.beepCancel(); closeModal(); });
}

let matchHistory = [];

function renderGameResult(won) {
  const wins = match.wins;
  const c = openModal(`
    <h2>${won ? '🎉 かち!' : 'まけ…'}</h2>
    <div id="game-status">${wins}かい あてた!<br>${won ? 'ごきげんアップ &amp; うんどうに なった!' : 'でも いいうんどうに なった!'}</div>
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
  showMsg('たまごが とどいた! 5ふんで うまれるよ', 4000);
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
  if (patting && Date.now() > pattingUntil) patting = false;
  renderScene(ctx, state, { frame, theme: settings.theme, overlay, patting });
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
  pattingUntil = Date.now() + 500;
  snd.beep();
  if (r === 'ok') {
    showMsg('なでなで うれしい!');
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

// ---- 入力(アイコン・A/B/C)----

function bindInputs() {
  iconButtons().forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedIcon = -1;
      highlightSelection();
      ACTIONS[btn.dataset.action]();
    });
  });

  $('#btn-settings').addEventListener('click', openSettings);

  $('#screen').addEventListener('click', doPat);

  $('#btn-a').addEventListener('click', () => {
    if (modalOpen()) return;
    snd.beep();
    selectedIcon = (selectedIcon + 1) % iconButtons().length;
    highlightSelection();
  });

  $('#btn-b').addEventListener('click', () => {
    if (modalOpen()) return;
    if (selectedIcon < 0) return;
    const btn = iconButtons()[selectedIcon];
    selectedIcon = -1;
    highlightSelection();
    ACTIONS[btn.dataset.action]();
  });

  $('#btn-c').addEventListener('click', () => {
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
  draw();

  setInterval(gameTick, 1000);           // 1秒ごとに実時間と同期
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
    draw();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW registration failed', e));
  }
}

init();

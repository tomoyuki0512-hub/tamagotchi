// storage.js — localStorage へのセーブ/ロード

const SAVE_KEY = 'picotchi-save-v1';
const SETTINGS_KEY = 'picotchi-settings-v1';

export function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('セーブに失敗しました', e);
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (state.version !== 1) return null; // 将来スキーマが変わったらここでマイグレーション
    return state;
  } catch {
    return null;
  }
}

export function clearGame() {
  localStorage.removeItem(SAVE_KEY);
}

const DEFAULT_SETTINGS = { theme: 'retro', sound: true };

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('設定の保存に失敗しました', e);
  }
}

// 生涯記録(世代リセットをまたいで残る、そだてなおしても消えない)
const RECORDS_KEY = 'picotchi-records-v1';

const DEFAULT_RECORDS = {
  generations: 0,
  totalPats: 0,
  gamesPlayed: 0,
  gamesWon: 0,
  longestLifeDays: 0,
  bestAvgReactionMs: null,
};

export function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    return raw ? { ...DEFAULT_RECORDS, ...JSON.parse(raw) } : { ...DEFAULT_RECORDS };
  } catch {
    return { ...DEFAULT_RECORDS };
  }
}

export function saveRecords(records) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch (e) {
    console.warn('きろくの保存に失敗しました', e);
  }
}

// あそび時間セッション(5分あそんだら10分休憩)。アプリを閉じても続くよう永続化する
const PLAY_SESSION_KEY = 'picotchi-playsession-v1';
const DEFAULT_PLAY_SESSION = { playStartAt: null, breakUntil: null };

export function loadPlaySession() {
  try {
    const raw = localStorage.getItem(PLAY_SESSION_KEY);
    return raw ? { ...DEFAULT_PLAY_SESSION, ...JSON.parse(raw) } : { ...DEFAULT_PLAY_SESSION };
  } catch {
    return { ...DEFAULT_PLAY_SESSION };
  }
}

export function savePlaySession(session) {
  try {
    localStorage.setItem(PLAY_SESSION_KEY, JSON.stringify(session));
  } catch (e) {
    console.warn('あそび時間の保存に失敗しました', e);
  }
}

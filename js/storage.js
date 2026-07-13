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

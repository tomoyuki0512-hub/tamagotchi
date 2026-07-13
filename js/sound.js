// sound.js — WebAudio によるピコピコ音(初代らしい矩形波ビープ)

let ctx = null;
let enabled = true;

export function setSoundEnabled(on) {
  enabled = on;
}

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, startAfter, duration, volume = 0.06) {
  const ac = ensureCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  gain.gain.value = volume;
  osc.connect(gain).connect(ac.destination);
  const t = ac.currentTime + startAfter;
  osc.start(t);
  osc.stop(t + duration);
}

export function beep() {
  if (!enabled) return;
  tone(880, 0, 0.05);
}

export function beepConfirm() {
  if (!enabled) return;
  tone(660, 0, 0.06);
  tone(990, 0.07, 0.08);
}

export function beepCancel() {
  if (!enabled) return;
  tone(440, 0, 0.08);
}

export function beepAttention() {
  if (!enabled) return;
  tone(1320, 0, 0.09);
  tone(1320, 0.15, 0.09);
  tone(1320, 0.3, 0.09);
}

export function jingleEvolve() {
  if (!enabled) return;
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.11));
}

export function jingleSad() {
  if (!enabled) return;
  [523, 440, 349, 262].forEach((f, i) => tone(f, i * 0.18, 0.16));
}

export function jingleWin() {
  if (!enabled) return;
  [784, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.09));
}

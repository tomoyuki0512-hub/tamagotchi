// render.js — Canvas への描画。論理解像度 64x48 のゲームピクセルを拡大表示する。

import { SPRITES, SMALL, PALETTES } from './sprites.js';

export const VIEW_W = 64;
export const VIEW_H = 48;

const RETRO_INK = '#20261f'; // レトロテーマの液晶ドット色

function colorFor(theme, spriteKey, ch) {
  // レトロ(1bit液晶)ではサブ色 'o' を消灯ピクセルにして目や口を抜く
  if (theme === 'retro') return ch === 'o' ? null : RETRO_INK;
  const pal = PALETTES[spriteKey] || { primary: RETRO_INK, secondary: RETRO_INK };
  return ch === '#' ? pal.primary : pal.secondary;
}

// rows(文字列配列)を (x, y) に scale 倍で描く
function drawSprite(ctx, rows, x, y, scale, theme, spriteKey) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === '.') continue;
      const color = colorFor(theme, spriteKey, ch);
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
    }
  }
}

export function setupCanvas(canvas) {
  const px = 5; // 1ゲームピクセル = 5実ピクセル
  canvas.width = VIEW_W * px;
  canvas.height = VIEW_H * px;
  const ctx = canvas.getContext('2d');
  ctx.scale(px, px);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

// メイン画面を1フレーム描画する
// opts: { frame: 0|1, theme: 'retro'|'modern', overlay: null|'meal'|'snack', patting: boolean }
export function renderScene(ctx, state, opts) {
  const { frame, theme } = opts;
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);

  if (state.dead) {
    drawSprite(ctx, SPRITES.tombstone.frames[0], 16, 8, 2, theme, 'tombstone');
    return;
  }

  const key = state.character;
  const sprite = SPRITES[key] || SPRITES.egg;
  const rows = sprite.frames[frame % sprite.frames.length];

  // キャラ本体(16x16 を 2倍 = 32x32、中央)。なでられた瞬間はぴょんと弾む
  const charX = 16;
  const charY = opts.patting ? 6 : 8;
  drawSprite(ctx, rows, charX, charY, 2, theme, key);

  if (opts.patting) {
    drawSprite(ctx, SMALL.heart, 10, 4, 1, theme, 'heart');
    drawSprite(ctx, SMALL.heart, 46, 8, 1, theme, 'heart');
  }

  // 食事中はキャラの左に食べ物
  if (opts.overlay === 'meal' || opts.overlay === 'snack') {
    drawSprite(ctx, SMALL[opts.overlay], 2, 26, 2, theme, opts.overlay);
  }

  // 睡眠中は Zzz
  if (state.asleep) {
    drawSprite(ctx, SMALL.zzz, 46, 4, 2, theme, 'zzz');
  }

  // 病気はどくろ
  if (state.sick) {
    drawSprite(ctx, SMALL.skull, 46, 22, 2, theme, 'skull');
  }

  // うんち(右下に積み上げ)
  for (let i = 0; i < state.poops; i++) {
    const col = i % 2;
    const rowI = Math.floor(i / 2);
    drawSprite(ctx, SMALL.poop, 50 - col * 12, 38 - rowI * 9, 1, theme, 'poop');
  }
}

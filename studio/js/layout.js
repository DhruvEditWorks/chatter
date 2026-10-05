// ─────────────────────────────────────────────────────────────
// Message layout — pure measurement, no drawing.
// Works in "pt" space (theme.BASE_W wide). Cached by a cheap hash
// so dragging the playhead never re-measures.
// ─────────────────────────────────────────────────────────────

import { getImage } from './assets.js';
import { clockAdd } from './util.js';

const measureCanvas = document.createElement('canvas');
const mctx = measureCanvas.getContext('2d');

export function fontStr(size, weight, family) {
  return `${weight || 400} ${size}px ${family}`;
}

export function measureText(txt, size, weight, family) {
  mctx.font = fontStr(size, weight, family);
  return mctx.measureText(txt).width;
}

/** Greedy word-wrap that also honours explicit \n. */
export function wrapText(text, maxW, size, weight, family) {
  mctx.font = fontStr(size, weight, family);
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    if (para === '') { out.push(''); continue; }
    const words = para.split(/(\s+)/);
    let line = '';
    for (const w of words) {
      const test = line + w;
      if (mctx.measureText(test).width <= maxW || line === '') {
        line = test;
      } else {
        out.push(line.replace(/\s+$/, ''));
        line = w.replace(/^\s+/, '');
      }
      // hard-break a single huge word
      while (mctx.measureText(line).width > maxW && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && mctx.measureText(line.slice(0, cut)).width > maxW) cut--;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line.replace(/\s+$/, ''));
  }
  return out.length ? out : [''];
}

function hashScene(scene, th, W) {
  const b = th.bubble, l = th.list;
  return JSON.stringify([
    W, b.maxW, b.padX, b.padY, b.fontSize, b.lineH, b.timeSize, b.radius, b.imgMaxW, b.hideTimeInBubble,
    l.padX, l.gap, l.gapGroup, l.padTop, l.padBottom, th.font, th.variant, th.chip.size, th.chip.padY,
    scene.clock,
    scene.messages.map((m) => [m.id, m.from, m.type, m.text, m.img, m.time, m.reaction && m.reaction.emoji].join('\u0001')).join('\u0002'),
  ]);
}

const layoutCache = new Map();

/**
 * @returns {{items: Array, total: number}} items in top→bottom order
 */
export function layoutScene(scene, th, W) {
  const key = hashScene(scene, th, W);
  const hit = layoutCache.get(scene.id);
  if (hit && hit.key === key) return hit.value;

  const b = th.bubble, l = th.list;
  const innerW = W - l.padX * 2;
  const maxBubbleW = innerW * b.maxW;
  const maxContentW = maxBubbleW - b.padX * 2;
  const items = [];
  let prevFrom = null;
  let minuteCursor = 0;

  scene.messages.forEach((m, i) => {
    if (m.from === 'system') {
      const txtW = measureText(m.text, th.chip.size, 500, th.font);
      const h = th.chip.size * 1.35 + th.chip.padY * 2;
      items.push({
        m, kind: 'system', i,
        w: txtW + th.chip.padX * 2, h,
        gapBefore: i === 0 ? 0 : l.gapGroup,
        totalH: (i === 0 ? 0 : l.gapGroup) + h + 4,
      });
      prevFrom = null;
      return;
    }

    const side = m.from === 'me' ? 'out' : 'in';
    const isGroupStart = prevFrom !== m.from;
    const gapBefore = i === 0 ? 0 : isGroupStart ? l.gapGroup : l.gap;

    // timestamp label
    if (m.time == null) minuteCursor += i === 0 ? 0 : 1;
    const timeText = m.time != null ? m.time : clockAdd(scene.clock || '9:41 PM', minuteCursor);
    const timeW = measureText(timeText, b.timeSize, 400, th.font);
    const tickW = side === 'out' ? b.timeSize * 1.25 + 3 : 0;
    const timeBlockW = b.hideTimeInBubble ? 0 : timeW + tickW + b.timeGap;

    let bw = 0, bh = 0, lines = [], imgW = 0, imgH = 0, textTop = 0, inlineTime = false;

    if (m.type === 'image' && m.img) {
      const rec = getImage(m.img);
      const natW = rec && rec.ok ? rec.w : 1200;
      const natH = rec && rec.ok ? rec.h : 800;
      imgW = Math.min(innerW * b.imgMaxW, maxBubbleW - 6);
      imgH = Math.max(40, (imgW * natH) / Math.max(1, natW));
      const capMax = imgW - (m.text ? 0 : 0);
      lines = m.text ? wrapText(m.text, capMax - b.padX * 0, b.fontSize, 400, th.font) : [];
      bw = imgW + 6;
      bh = imgH + 6;
      textTop = bh;
      if (lines.length) {
        bh += b.captionPad + lines.length * b.lineH + b.padY;
      }
      if (!b.hideTimeInBubble && !lines.length) {
        // time floats over the image, no extra height
      } else if (!b.hideTimeInBubble) {
        bh += 0;
      }
    } else {
      lines = wrapText(m.text, maxContentW, b.fontSize, 400, th.font);
      let maxLineW = 0;
      for (const ln of lines) maxLineW = Math.max(maxLineW, measureText(ln, b.fontSize, 400, th.font));
      const lastW = measureText(lines[lines.length - 1] || '', b.fontSize, 400, th.font);
      inlineTime = !b.hideTimeInBubble && lastW + timeBlockW + 4 <= maxContentW;
      const contentW = b.hideTimeInBubble
        ? maxLineW
        : inlineTime
          ? Math.max(maxLineW, lastW + timeBlockW + 4)
          : Math.max(maxLineW, timeBlockW);
      bw = Math.min(maxBubbleW, contentW + b.padX * 2);
      bh = b.padY * 2 + lines.length * b.lineH + (b.hideTimeInBubble || inlineTime ? 0 : b.timeSize * 1.15);
      textTop = b.padY;
    }

    const reactH = m.reaction ? b.timeSize * 1.9 : 0;
    const h = bh + reactH * 0.72;

    items.push({
      m, kind: 'msg', i, side,
      w: bw, h, bh, lines, imgW, imgH, textTop,
      inlineTime: m.type === 'image' ? false : inlineTime,
      timeText, timeW, tickW, timeBlockW,
      isGroupEnd: isGroupEnd(scene.messages, i),
      isGroupStart,
      gapBefore,
      totalH: gapBefore + h,
    });
    prevFrom = m.from;
  });

  let total = l.padTop + l.padBottom;
  for (const it of items) total += it.totalH;

  const value = { items, total, innerW, maxBubbleW };
  layoutCache.set(scene.id, { key, value });
  return value;
}

function isGroupEnd(msgs, i) {
  const next = msgs[i + 1];
  return !next || next.from !== msgs[i].from;
}

export function invalidateLayout(sceneId) {
  if (sceneId) layoutCache.delete(sceneId); else layoutCache.clear();
}

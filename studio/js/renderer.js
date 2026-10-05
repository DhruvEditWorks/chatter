// ─────────────────────────────────────────────────────────────
// Deterministic canvas renderer.
//   renderFrame(ctx, project, t)  →  the frame at exactly time t.
// No Date.now(), no Math.random() — every frame is reproducible,
// which is what makes frame-by-frame PNG export exact.
// ─────────────────────────────────────────────────────────────

import { BASE_W, getTheme } from './theme.js';
import { layoutScene, measureText, wrapText, fontStr } from './layout.js';
import { getImage } from './assets.js';
import { clamp, ease, evalStep, evalNum, evalObj, seeded } from './util.js';

/* ───────── small canvas helpers ───────── */

function rr(ctx, x, y, w, h, r) {
  const rad = typeof r === 'number' ? { tl: r, tr: r, br: r, bl: r } : r;
  const m = Math.min(w, h) / 2;
  const tl = Math.min(rad.tl, m), tr = Math.min(rad.tr, m), br = Math.min(rad.br, m), bl = Math.min(rad.bl, m);
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

const ICONS = {
  chevronLeft: 'M15 18l-6-6 6-6',
  back: 'M15 18l-6-6 6-6',
  video: 'M3 7.5a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 15 7.5v9A1.5 1.5 0 0 1 13.5 18h-9A1.5 1.5 0 0 1 3 16.5zM15 10.5l6-3.5v10l-6-3.5z',
  phone: 'M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  more: 'M12 6.2h.01M12 12h.01M12 17.8h.01',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01',
  clip: 'M20 11l-8.5 8.5a4.6 4.6 0 0 1-6.5-6.5L13 4.5a3.2 3.2 0 0 1 4.5 4.5L9 17.5a1.8 1.8 0 0 1-2.5-2.5L14 7.5',
  camera: 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 16.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z',
  mic: 'M12 3.5a2.6 2.6 0 0 1 2.6 2.6v5a2.6 2.6 0 0 1-5.2 0v-5A2.6 2.6 0 0 1 12 3.5zM6 11a6 6 0 0 0 12 0M12 17v3.5',
  send: 'M4 11.8 20.5 4 13 20.5l-1.6-6.9z',
  sendFill: 'M3.5 20.5 21 12 3.5 3.5 3.5 10l12 2-12 2z',
  plus: 'M12 5.5v13M5.5 12h13',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.6h.01',
  check: 'M4.5 12.5 9 17 19.5 6.5',
  sticker: 'M20 12a8 8 0 1 1-8-8c0 4 4 8 8 8z',
};

function icon(ctx, name, cx, cy, size, color, lw = 1.9, fill = false) {
  const d = ICONS[name];
  if (!d) return;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  const p = new Path2D(d);
  if (fill) { ctx.fillStyle = color; ctx.fill(p); }
  else {
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke(p);
  }
  ctx.restore();
}

function drawAvatar(ctx, src, cx, cy, d, fallbackText, th) {
  const r = d / 2;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
  const rec = src ? getImage(src) : null;
  if (rec && rec.ok) {
    const s = Math.max(d / rec.w, d / rec.h);
    const w = rec.w * s, h = rec.h * s;
    ctx.drawImage(rec.img, cx - w / 2, cy - h / 2, w, h);
  } else {
    ctx.fillStyle = '#6a7b86';
    ctx.fillRect(cx - r, cy - r, d, d);
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.font = fontStr(d * 0.42, 600, th.font);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(fallbackText || '?').trim().slice(0, 1).toUpperCase(), cx, cy + d * 0.02);
  }
  ctx.restore();
}

/* ───────── typing reveal (deterministic) ───────── */

const revealCache = new Map();
function revealPoints(m) {
  const key = m.id + '|' + (m.text || '').length;
  if (revealCache.has(key)) return revealCache.get(key);
  const text = m.text || '';
  const rnd = seeded(m.id);
  const w = [];
  let sum = 0;
  for (let i = 0; i < text.length; i++) {
    // spaces + punctuation take slightly longer → human rhythm
    let base = 1 + (rnd() - 0.5) * 0.55;
    const ch = text[i];
    if (ch === ' ') base *= 1.15;
    if (/[.,!?…]/.test(ch)) base *= 2.1;
    if (ch === '\n') base *= 2.6;
    if (rnd() < 0.045) base *= 3.2; // occasional hesitation
    w.push(base); sum += base;
  }
  let acc = 0;
  const pts = w.map((x) => (acc += x) / (sum || 1));
  revealCache.set(key, pts);
  return pts;
}
export function typedText(m, p) {
  const text = m.text || '';
  if (p >= 1) return text;
  if (p <= 0) return '';
  const pts = revealPoints(m);
  let n = 0;
  while (n < pts.length && pts[n] <= p) n++;
  return text.slice(0, n);
}

/* ───────── time-dependent state ───────── */

export function activeTypingMsg(sc, t) {
  for (const m of sc.messages) {
    if (m.from !== 'me' || m.type === 'system') continue;
    if (m.showTypeInBar === false) continue;
    if (m.typeStart == null) continue;
    if (t >= m.typeStart && t < m.appear) return m;
  }
  return null;
}

export function activeDotsMsg(sc, t) {
  for (const m of sc.messages) {
    if (m.from !== 'them' || m.type === 'system') continue;
    if (m.showDots === false || m.dotsStart == null) continue;
    if (t >= m.dotsStart && t < m.appear) return m;
  }
  return null;
}

/** Place visible blocks for time t. Returns {blocks, h}. */
export function placeBlocks(sc, lay, th, t, dotsOn) {
  const blocks = [];
  let h = th.list.padTop;
  let first = true;
  for (const it of lay.items) {
    const a = it.m.appear;
    if (a == null || t < a) continue;
    const g = first ? 0 : it.gapBefore;
    first = false;
    blocks.push({ it, y: h + g, h: it.h });
    h += g + it.h;
  }
  if (dotsOn) {
    const g = first ? 0 : th.list.gapGroup;
    first = false;
    blocks.push({ dots: true, y: h + g, h: th.dots.h });
    h += g + th.dots.h;
  }
  h += th.list.padBottom;
  return { blocks, h };
}

/* ───────── smoothed content-height chain (= smooth auto scroll) ───────── */

const chainCache = new Map();
function contentChain(sc, lay, th, dur) {
  const key = JSON.stringify([
    sc.id, lay.total, dur, th.list.padTop, th.list.padBottom, th.dots.h,
    sc.messages.map((m) => [m.appear, m.dotsStart, m.showDots, m.from].join(',')).join(';'),
  ]);
  const hit = chainCache.get(sc.id);
  if (hit && hit.key === key) return hit.chain;

  const times = new Set([0]);
  for (const m of sc.messages) {
    if (m.appear != null) times.add(+m.appear.toFixed(4));
    if (m.from === 'them' && m.showDots !== false && m.dotsStart != null) times.add(+m.dotsStart.toFixed(4));
  }
  const evs = Array.from(times).sort((a, b) => a - b);

  const heightAt = (t) => {
    const dotsM = activeDotsMsg(sc, t);
    return placeBlocks(sc, lay, th, t, !!dotsM).h;
  };

  const chain = [];
  const evalChain = (t) => {
    let v = null;
    for (const s of chain) {
      if (t >= s.t0) v = t >= s.t1 ? s.to : s.from + (s.to - s.from) * ease.out(clamp((t - s.t0) / (s.t1 - s.t0), 0, 1));
      else break;
    }
    return v == null ? heightAt(0) : v;
  };

  for (const e of evs) {
    const target = heightAt(e + 1e-4);
    const from = chain.length ? evalChain(e) : target;
    if (chain.length && Math.abs(target - from) < 0.01) continue;
    chain.push({ t0: e, t1: e + Math.max(0.0001, dur), from, to: target });
  }
  if (!chain.length) chain.push({ t0: 0, t1: 0.0001, from: heightAt(0), to: heightAt(0) });

  chainCache.set(sc.id, { key, chain });
  return chain;
}
function evalChainAt(chain, t) {
  let v = chain[0].from;
  for (const s of chain) {
    if (t >= s.t0) v = t >= s.t1 ? s.to : s.from + (s.to - s.from) * ease.out(clamp((t - s.t0) / (s.t1 - s.t0), 0, 1));
    else break;
  }
  return v;
}
export function invalidateChain(id) { if (id) chainCache.delete(id); else chainCache.clear(); }

/* ───────── header status text ───────── */

export function headerStatus(sc, th, t, dotsM) {
  if (dotsM && sc.ui.headerTyping) return sc.ui.typingLabel || 'typing…';
  const v = evalStep(sc.tracks.status, t, { mode: 'online' });
  if (!v) return '';
  switch (v.mode) {
    case 'online': return 'online';
    case 'offline': return '';
    case 'lastseen': return `last seen ${v.text || 'recently'}`;
    case 'typing': return v.text || 'typing…';
    case 'custom': return v.text || '';
    default: return '';
  }
}

/* ───────── message appear animation ───────── */

function applyAppearAnim(ctx, kind, p, x, y, w, h, side) {
  const e = clamp(p, 0, 1);
  let alpha = 1;
  switch (kind) {
    case 'none': return 1;
    case 'fade': alpha = ease.out(e); break;
    case 'pop': {
      const s = 0.72 + 0.28 * ease.back(e);
      alpha = clamp(e * 2.2, 0, 1);
      const ax = side === 'out' ? x + w : x;
      const ay = y + h;
      ctx.translate(ax, ay); ctx.scale(s, s); ctx.translate(-ax, -ay);
      break;
    }
    case 'slide': {
      const dx = (side === 'out' ? 1 : -1) * (1 - ease.outQuint(e)) * (w * 0.55 + 40);
      alpha = clamp(e * 2.4, 0, 1);
      ctx.translate(dx, 0);
      break;
    }
    case 'rise': {
      const dy = (1 - ease.outQuint(e)) * (h + 14);
      alpha = clamp(e * 2.4, 0, 1);
      ctx.translate(0, dy);
      break;
    }
    case 'bounce': {
      const s = 0.6 + 0.4 * ease.elastic(e);
      alpha = clamp(e * 3, 0, 1);
      const ax = side === 'out' ? x + w : x;
      ctx.translate(ax, y + h); ctx.scale(s, s); ctx.translate(-ax, -(y + h));
      break;
    }
    default: alpha = ease.out(e);
  }
  return alpha;
}
export const ANIMS = ['pop', 'fade', 'slide', 'rise', 'bounce', 'none'];

/* ───────── bubble ───────── */

function bubbleShape(ctx, x, y, w, h, th, side, hasTail) {
  const b = th.bubble;
  const r = b.radius;
  const tailAt = b.tailAt || (th.variant === 'imessage' ? 'last' : 'first');
  let rad = { tl: r, tr: r, br: r, bl: r };
  if (hasTail) {
    if (tailAt === 'first') { if (side === 'in') rad.tl = b.tailRadius; else rad.tr = b.tailRadius; }
    else { if (side === 'in') rad.bl = b.tailRadius; else rad.br = b.tailRadius; }
  }
  rr(ctx, x, y, w, h, rad);
  ctx.fill();
  if (hasTail) {
    const tw = Math.max(5, r * 0.85), tht = Math.max(7, r * 1.05);
    ctx.beginPath();
    if (tailAt === 'first') {
      if (side === 'in') { ctx.moveTo(x, y); ctx.lineTo(x - tw, y); ctx.quadraticCurveTo(x - tw * 0.1, y + tht * 0.42, x, y + tht); }
      else { ctx.moveTo(x + w, y); ctx.lineTo(x + w + tw, y); ctx.quadraticCurveTo(x + w + tw * 0.1, y + tht * 0.42, x + w, y + tht); }
    } else {
      if (side === 'in') { ctx.moveTo(x, y + h); ctx.lineTo(x - tw, y + h); ctx.quadraticCurveTo(x - tw * 0.1, y + h - tht * 0.42, x, y + h - tht); }
      else { ctx.moveTo(x + w, y + h); ctx.lineTo(x + w + tw, y + h); ctx.quadraticCurveTo(x + w + tw * 0.1, y + h - tht * 0.42, x + w, y + h - tht); }
    }
    ctx.closePath();
    ctx.fill();
  }
}

function drawTicks(ctx, x, y, size, state, th) {
  const b = th.bubble;
  const col = state === 'read' ? b.tickRead : b.tickSent;
  if (state === 'sent') {
    icon(ctx, 'check', x + size * 0.5, y, size, col, 2.6);
  } else {
    icon(ctx, 'check', x + size * 0.34, y, size, col, 2.6);
    icon(ctx, 'check', x + size * 0.84, y, size, col, 2.6);
  }
}

function tickState(m, t) {
  if (m.tRead != null && t >= m.tRead) return 'read';
  if (m.tDelivered != null && t >= m.tDelivered) return 'delivered';
  return 'sent';
}

function drawMessage(ctx, it, W, yTop, th, sc, t) {
  const b = th.bubble, l = th.list;
  const m = it.m;

  if (it.kind === 'system') {
    const p = clamp((t - m.appear) / (m.animDur || 0.3), 0, 1);
    ctx.save();
    ctx.globalAlpha *= ease.out(p);
    const cw = it.w, cx = (W - cw) / 2;
    ctx.fillStyle = th.chip.bg;
    rr(ctx, cx, yTop, cw, it.h, th.chip.radius); ctx.fill();
    ctx.fillStyle = th.chip.fg;
    ctx.font = fontStr(th.chip.size, 500, th.font);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(m.text, W / 2, yTop + it.h / 2 + 0.5);
    ctx.restore();
    return;
  }

  const side = it.side;
  const x = side === 'out' ? W - l.padX - it.w : l.padX;
  const bh = it.bh;

  ctx.save();
  const alpha = applyAppearAnim(ctx, m.anim || sc.ui.defaultAnim || 'pop', (t - m.appear) / (m.animDur || sc.ui.animDur || 0.32), x, yTop, it.w, bh, side);
  ctx.globalAlpha *= clamp(alpha, 0, 1);

  // shadow
  if (b.shadowBlur > 0) {
    ctx.shadowColor = b.shadow; ctx.shadowBlur = b.shadowBlur; ctx.shadowOffsetY = b.shadowY;
  }
  ctx.fillStyle = side === 'out' ? b.outBg : b.inBg;
  const tailAt = b.tailAt || (th.variant === 'imessage' ? 'last' : 'first');
  const hasTail = b.tail && (tailAt === 'first' ? it.isGroupStart : it.isGroupEnd);
  bubbleShape(ctx, x, yTop, it.w, bh, th, side, hasTail);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  const fg = side === 'out' ? b.outFg : b.inFg;
  const timeCol = side === 'out' ? b.outTime : b.inTime;

  if (m.type === 'image' && m.img) {
    const ix = x + 3, iy = yTop + 3;
    const rec = getImage(m.img);
    ctx.save();
    rr(ctx, ix, iy, it.imgW, it.imgH, b.imgRadius); ctx.clip();
    if (rec && rec.ok) {
      const s = Math.max(it.imgW / rec.w, it.imgH / rec.h);
      ctx.drawImage(rec.img, ix + (it.imgW - rec.w * s) / 2, iy + (it.imgH - rec.h * s) / 2, rec.w * s, rec.h * s);
    } else {
      ctx.fillStyle = 'rgba(128,128,128,.35)'; ctx.fillRect(ix, iy, it.imgW, it.imgH);
    }
    ctx.restore();
    // caption
    if (it.lines.length) {
      ctx.fillStyle = fg;
      ctx.font = fontStr(b.fontSize, 400, th.font);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      let ly = iy + it.imgH + b.captionPad + b.lineH * 0.76;
      for (const ln of it.lines) { ctx.fillText(ln, ix + 3, ly); ly += b.lineH; }
    }
    if (!b.hideTimeInBubble) {
      const ty = it.lines.length ? yTop + bh - b.padY * 0.4 : iy + it.imgH - 7;
      if (!it.lines.length) {
        const pw = it.timeW + it.tickW + 14;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        rr(ctx, ix + it.imgW - pw - 6, ty - 12, pw, 17, 8.5); ctx.fill();
      }
      ctx.fillStyle = it.lines.length ? timeCol : 'rgba(255,255,255,.92)';
      ctx.font = fontStr(b.timeSize, 400, th.font);
      ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
      const tx = ix + it.imgW - 10 - (side === 'out' ? it.tickW : 0);
      ctx.fillText(it.timeText, tx, ty);
      if (side === 'out') drawTicks(ctx, tx + 3, ty - b.timeSize * 0.42, b.timeSize * 1.25, tickState(m, t), th);
    }
  } else {
    ctx.fillStyle = fg;
    ctx.font = fontStr(b.fontSize, 400, th.font);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    let ly = yTop + b.padY + b.lineH * 0.76;
    for (const ln of it.lines) { ctx.fillText(ln, x + b.padX, ly); ly += b.lineH; }

    if (!b.hideTimeInBubble) {
      const ty = yTop + bh - b.padY + (it.inlineTime ? -b.lineH * 0.06 : -1);
      ctx.fillStyle = timeCol;
      ctx.font = fontStr(b.timeSize, 400, th.font);
      ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
      const rightEdge = x + it.w - b.padX;
      const tx = rightEdge - (side === 'out' ? it.tickW : 0);
      ctx.fillText(it.timeText, tx, ty);
      if (side === 'out') drawTicks(ctx, tx + 2.5, ty - b.timeSize * 0.42, b.timeSize * 1.25, tickState(m, t), th);
    }
  }

  // reaction pill
  if (m.reaction && m.reaction.emoji) {
    const rt = m.reaction.t != null ? m.reaction.t : m.appear + 0.8;
    if (t >= rt) {
      const rp = clamp((t - rt) / 0.3, 0, 1);
      const s = 0.6 + 0.4 * ease.back(rp);
      const pw = b.timeSize * 2.3, ph = b.timeSize * 1.9;
      const px = side === 'out' ? x + it.w - pw - 6 : x + 6;
      const py = yTop + bh - ph * 0.35;
      ctx.save();
      ctx.translate(px + pw / 2, py + ph / 2); ctx.scale(s, s); ctx.translate(-(px + pw / 2), -(py + ph / 2));
      ctx.fillStyle = side === 'out' ? b.outBg : b.inBg;
      ctx.strokeStyle = th.screenBg; ctx.lineWidth = 1.6;
      rr(ctx, px, py, pw, ph, ph / 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = fontStr(b.timeSize * 1.15, 400, th.font);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(m.reaction.emoji, px + pw / 2, py + ph / 2 + 0.5);
      ctx.restore();
    }
  }

  ctx.restore();
}

/* ───────── typing dots bubble ───────── */

function drawDots(ctx, x, y, th, t, appearP) {
  const d = th.dots;
  ctx.save();
  const s = 0.7 + 0.3 * ease.back(clamp(appearP, 0, 1));
  ctx.globalAlpha *= clamp(appearP * 2.2, 0, 1);
  ctx.translate(x, y + d.h); ctx.scale(s, s); ctx.translate(-x, -(y + d.h));
  ctx.fillStyle = d.bg;
  const tailAt = th.bubble.tailAt || (th.variant === 'imessage' ? 'last' : 'first');
  bubbleShape(ctx, x, y, d.w, d.h, { ...th, bubble: { ...th.bubble, radius: d.r } }, 'in', th.bubble.tail);
  const cx0 = x + d.w / 2 - d.gap - d.dot;
  for (let i = 0; i < 3; i++) {
    const ph = (t * d.speed * Math.PI * 2 - i * 0.6) % (Math.PI * 2);
    const bump = Math.max(0, Math.sin(ph));
    ctx.globalAlpha = (0.45 + 0.55 * bump) * ctx.globalAlpha;
    ctx.fillStyle = d.fg;
    ctx.beginPath();
    ctx.arc(cx0 + i * (d.dot * 2 + d.gap) * 0.92, y + d.h / 2 - bump * d.amp, d.dot, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = ctx.globalAlpha / (0.45 + 0.55 * bump);
  }
  ctx.restore();
}

/* ───────── chrome: status bar / header / input ───────── */

function drawStatusBar(ctx, W, th, sc, t) {
  const sb = th.statusBar;
  if (!sb.show) return;
  ctx.save();
  ctx.fillStyle = sb.fg;
  ctx.font = fontStr(sb.size, sb.weight, th.font);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const cy = sb.h * 0.62;
  ctx.fillText(sc.ui.statusBarTime || sc.clock || '9:41', sb.padX, cy);
  if (sb.icons) {
    const rightX = W - sb.padX;
    // battery
    const bw = 22, bh2 = 11;
    const bx = rightX - bw;
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = sb.fg; ctx.lineWidth = 1.1;
    rr(ctx, bx, cy - bh2 / 2, bw, bh2, 3.2); ctx.stroke();
    ctx.fillStyle = sb.fg;
    const lvl = clamp((sc.ui.battery ?? 78) / 100, 0, 1);
    rr(ctx, bx + 1.6, cy - bh2 / 2 + 1.6, (bw - 3.2) * lvl, bh2 - 3.2, 1.8); ctx.fill();
    ctx.beginPath(); ctx.moveTo(bx + bw + 1.4, cy - 2.4); ctx.lineTo(bx + bw + 1.4, cy + 2.4); ctx.lineWidth = 2; ctx.strokeStyle = sb.fg; ctx.stroke();
    // wifi
    const wx = bx - 12;
    ctx.strokeStyle = sb.fg; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(wx, cy + 4, 2.2 + i * 2.8, Math.PI * 1.22, Math.PI * 1.78);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(wx, cy + 4.2, 1.1, 0, Math.PI * 2); ctx.fillStyle = sb.fg; ctx.fill();
    // signal bars
    const gx = wx - 22;
    for (let i = 0; i < 4; i++) {
      const hh = 3 + i * 2.6;
      ctx.fillStyle = sb.fg;
      rr(ctx, gx + i * 4.4, cy + 5 - hh, 3, hh, 1); ctx.fill();
    }
  }
  ctx.restore();
}

function drawHeader(ctx, W, th, sc, t, dotsM) {
  const hd = th.header;
  if (!hd.show) return;
  const y0 = th.statusBar.show ? th.statusBar.h : 0;
  ctx.save();
  ctx.fillStyle = hd.bg;
  ctx.fillRect(0, y0, W, hd.h);
  ctx.strokeStyle = hd.divider; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(0, y0 + hd.h - 0.4); ctx.lineTo(W, y0 + hd.h - 0.4); ctx.stroke();

  const name = sc.contactName || 'Chat';
  const status = headerStatus(sc, th, t, dotsM);
  const cy = y0 + hd.h / 2;

  if (hd.stacked) {
    // iMessage: centered avatar + name under it
    if (hd.showBack) icon(ctx, 'chevronLeft', hd.padX + 8, cy + 6, 22, hd.iconColor, 2.2);
    drawAvatar(ctx, sc.contactAvatar, W / 2, y0 + hd.h * 0.42, hd.avatar, name, th);
    ctx.fillStyle = hd.fg;
    ctx.font = fontStr(hd.nameSize, hd.nameWeight, th.font);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(name, W / 2, y0 + hd.h - 8);
    if (status) {
      ctx.fillStyle = hd.sub; ctx.font = fontStr(hd.subSize, 400, th.font);
      ctx.fillText(status, W / 2, y0 + hd.h + hd.subSize + 2);
    }
  } else {
    let x = hd.padX;
    if (hd.showBack) { icon(ctx, 'chevronLeft', x + 9, cy, 22, hd.iconColor, 2.1); x += 22; }
    drawAvatar(ctx, sc.contactAvatar, x + hd.avatar / 2, cy, hd.avatar, name, th);
    x += hd.avatar + hd.gap;
    const hasStatus = !!status;
    ctx.fillStyle = hd.fg;
    ctx.font = fontStr(hd.nameSize, hd.nameWeight, th.font);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(name, x, hasStatus ? cy - 1 : cy + hd.nameSize * 0.36);
    if (hasStatus) {
      ctx.fillStyle = dotsM && sc.ui.headerTyping ? (sc.ui.typingColor || hd.sub) : hd.sub;
      ctx.font = fontStr(hd.subSize, 400, th.font);
      ctx.fillText(status, x, cy + hd.subSize + 2);
    }
    if (hd.showActions) {
      icon(ctx, 'more', W - hd.padX - 8, cy, 21, hd.iconColor, 2.4);
      icon(ctx, 'phone', W - hd.padX - 40, cy, 20, hd.iconColor, 1.8);
      icon(ctx, 'video', W - hd.padX - 72, cy, 21, hd.iconColor, 1.8);
    }
  }
  ctx.restore();
}

/** Input bar height can grow with typed text → measured first. */
export function inputMetrics(th, sc, t, W) {
  const ip = th.input;
  if (!ip.show) return { h: 0, lines: [''], typing: null, text: '' };
  const m = activeTypingMsg(sc, t);
  let text = '';
  if (m) {
    const p = clamp((t - m.typeStart) / Math.max(0.0001, m.typeDur), 0, 1);
    text = typedText(m, p);
  }
  const leftPad = th.variant === 'imessage' ? ip.padX + 34 : ip.padX + 8;
  const rightPad = ip.padX + 54;
  const pillW = W - leftPad - rightPad;
  const innerW = pillW - ip.pillPadX * 2 - (th.variant === 'whatsapp' ? 58 : 20);
  const lines = text ? wrapText(text, innerW, ip.fontSize, 400, th.font).slice(0, 5) : [''];
  const lineH = ip.fontSize * 1.32;
  const pillH = Math.max(ip.radius * 2, lines.length * lineH + 17);
  const h = Math.max(ip.h, pillH + 14);
  return { h, lines, typing: m, text, pillW, pillH, leftPad, rightPad, lineH };
}

function drawInput(ctx, W, H, th, sc, t, met) {
  const ip = th.input;
  if (!ip.show) return;
  const y0 = H - met.h;
  ctx.save();
  ctx.fillStyle = ip.bg;
  ctx.fillRect(0, y0, W, met.h);

  const pillY = y0 + (met.h - met.pillH) / 2;
  ctx.fillStyle = ip.pill;
  rr(ctx, met.leftPad, pillY, met.pillW, met.pillH, Math.min(ip.radius, met.pillH / 2));
  ctx.fill();
  if (ip.pillStroke) { ctx.strokeStyle = ip.pillStroke; ctx.lineWidth = 1; ctx.stroke(); }

  const cyPill = pillY + met.pillH / 2;
  let tx = met.leftPad + ip.pillPadX;

  if (th.variant === 'whatsapp') {
    icon(ctx, 'smile', met.leftPad + 18, cyPill, 21, ip.icon, 1.7);
    tx = met.leftPad + 36;
    icon(ctx, 'clip', met.leftPad + met.pillW - 50, cyPill, 20, ip.icon, 1.7);
    icon(ctx, 'camera', met.leftPad + met.pillW - 20, cyPill, 20, ip.icon, 1.7);
  } else if (th.variant === 'imessage') {
    icon(ctx, 'plus', ip.padX + 17, cyPill, 24, ip.icon, 1.8);
  } else {
    icon(ctx, 'smile', met.leftPad + 18, cyPill, 21, ip.icon, 1.7);
    tx = met.leftPad + 36;
  }

  const textRight = th.variant === 'whatsapp' ? met.leftPad + met.pillW - 64 : met.leftPad + met.pillW - 34;
  const maxTextW = textRight - tx;

  ctx.save();
  ctx.beginPath(); ctx.rect(tx - 2, pillY, maxTextW + 4, met.pillH); ctx.clip();
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = fontStr(ip.fontSize, 400, th.font);
  if (met.text) {
    ctx.fillStyle = ip.fg;
    const n = met.lines.length;
    let ly = cyPill - ((n - 1) * met.lineH) / 2 + ip.fontSize * 0.36;
    met.lines.forEach((ln) => { ctx.fillText(ln, tx, ly); ly += met.lineH; });
    // caret
    const lastW = measureText(met.lines[n - 1], ip.fontSize, 400, th.font);
    const caretOn = met.typing ? true : (t * 1.6) % 1 < 0.55;
    if (caretOn && sc.ui.showCaret !== false) {
      ctx.fillStyle = ip.caret;
      const cyc = cyPill - ((n - 1) * met.lineH) / 2 + (n - 1) * met.lineH;
      rr(ctx, tx + lastW + 1.5, cyc - ip.fontSize * 0.62, 1.8, ip.fontSize * 1.18, 1);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = ip.placeholder;
    ctx.fillText(ip.placeholderText || 'Message', tx, cyPill + ip.fontSize * 0.36);
    if (sc.ui.showCaret !== false && th.variant === 'imessage') {
      const caretOn = (t * 1.6) % 1 < 0.55;
      if (caretOn) { ctx.fillStyle = ip.caret; rr(ctx, tx - 2, cyPill - ip.fontSize * 0.62, 1.8, ip.fontSize * 1.18, 1); ctx.fill(); }
    }
  }
  ctx.restore();

  // send / mic button
  const hasText = !!met.text;
  const bcx = W - ip.padX - 22, bcy = y0 + met.h - met.pillH / 2 - (met.h - met.pillH) / 2;
  if (th.variant === 'imessage') {
    if (hasText) {
      ctx.fillStyle = ip.sendBg;
      ctx.beginPath(); ctx.arc(met.leftPad + met.pillW - 16, cyPill, 14, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(0, -0.5);
      icon(ctx, 'sendFill', met.leftPad + met.pillW - 16, cyPill, 17, ip.sendFg, 0, true);
      ctx.restore();
    } else {
      icon(ctx, 'mic', met.leftPad + met.pillW - 18, cyPill, 20, ip.icon, 1.7);
    }
  } else {
    ctx.fillStyle = ip.sendBg;
    ctx.beginPath(); ctx.arc(bcx, bcy, 21, 0, Math.PI * 2); ctx.fill();
    if (hasText) icon(ctx, 'sendFill', bcx + 1, bcy, 21, ip.sendFg, 0, true);
    else icon(ctx, 'mic', bcx, bcy, 21, ip.sendFg, 1.9);
  }
  ctx.restore();
}

/* ───────── screen ───────── */

function drawScreen(ctx, proj, sc, t, W, H) {
  const th = sc._theme;

  // background
  ctx.save();
  ctx.fillStyle = th.screenBg;
  ctx.fillRect(0, 0, W, H);
  if (sc.wallpaper) {
    const rec = getImage(sc.wallpaper);
    if (rec && rec.ok) {
      const s = Math.max(W / rec.w, H / rec.h);
      ctx.globalAlpha = th.wallpaperOpacity ?? 1;
      ctx.drawImage(rec.img, (W - rec.w * s) / 2, (H - rec.h * s) / 2, rec.w * s, rec.h * s);
      ctx.globalAlpha = 1;
      if (th.wallpaperTint && th.wallpaperTint !== 'transparent') {
        ctx.fillStyle = th.wallpaperTint; ctx.fillRect(0, 0, W, H);
      }
    }
  }
  ctx.restore();

  const lay = layoutScene(sc, th, W);
  const dotsM = activeDotsMsg(sc, t);
  const showDotsBubble = !!dotsM && sc.ui.dotsBubble !== false;

  const met = inputMetrics(th, sc, t, W);
  const sbH = th.statusBar.show ? th.statusBar.h : 0;
  const hdH = th.header.show ? th.header.h + (th.header.stacked ? th.header.subSize + 6 : 0) : 0;
  const listTop = sbH + hdH;
  const listBottom = H - met.h;

  // smoothed content height → smooth auto-scroll
  const chain = contentChain(sc, lay, th, sc.ui.scrollDur ?? 0.35);
  const smoothH = evalChainAt(chain, t);
  const manual = evalNum(sc.tracks.scroll, t, 0);
  const placed = placeBlocks(sc, lay, th, t, showDotsBubble);
  const contentTop = listBottom - smoothH + manual;

  ctx.save();
  ctx.beginPath(); ctx.rect(0, listTop, W, Math.max(0, listBottom - listTop)); ctx.clip();
  for (const bl of placed.blocks) {
    const y = contentTop + bl.y;
    if (y > listBottom + 40 || y + bl.h < listTop - 60) continue;
    if (bl.dots) {
      const p = clamp((t - dotsM.dotsStart) / 0.22, 0, 1);
      drawDots(ctx, th.list.padX, y, th, t, p);
    } else {
      drawMessage(ctx, bl.it, W, y, th, sc, t);
    }
  }
  ctx.restore();

  drawHeader(ctx, W, th, sc, t, dotsM);
  drawStatusBar(ctx, W, th, sc, t);
  drawInput(ctx, W, H, th, sc, t, met);
}

/* ───────── frame ───────── */

export function renderFrame(ctx, proj, t) {
  const out = proj.out;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, out.w, out.h);
  if (out.bg && out.bg !== 'transparent') { ctx.fillStyle = out.bg; ctx.fillRect(0, 0, out.w, out.h); }

  const sc = proj.scenes[proj.active];
  if (!sc) { ctx.restore(); return; }
  sc._theme = getTheme(sc.theme || proj.theme, sc.themeOverrides || proj.themeOverrides);
  if (!sc.ui) sc.ui = {};

  const dev = proj.device;
  const cam = evalObj(sc.tracks.camera, t, { x: 0.5, y: 0.5, scale: 1, rot: 0, opacity: 1 });

  let base;
  switch (dev.fit) {
    case 'height': base = out.h / dev.h; break;
    case 'width': base = out.w / dev.w; break;
    case 'cover': base = Math.max(out.w / dev.w, out.h / dev.h); break;
    case 'actual': base = 1; break;
    default: base = Math.min(out.w / dev.w, out.h / dev.h);
  }
  base *= dev.zoom || 1;
  const s = base * (cam.scale || 1);

  ctx.globalAlpha = cam.opacity == null ? 1 : clamp(cam.opacity, 0, 1);
  ctx.translate(out.w * cam.x, out.h * cam.y);
  if (cam.rot) ctx.rotate((cam.rot * Math.PI) / 180);
  ctx.scale(s, s);
  ctx.translate(-dev.w / 2, -dev.h / 2);

  // device body / screen clip
  if (dev.radius > 0) { rr(ctx, 0, 0, dev.w, dev.h, dev.radius); ctx.clip(); }
  else { ctx.beginPath(); ctx.rect(0, 0, dev.w, dev.h); ctx.clip(); }

  const k = dev.w / BASE_W;
  ctx.scale(k, k);
  drawScreen(ctx, proj, sc, t, BASE_W, dev.h / k);

  ctx.restore();
}

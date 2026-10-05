// ─────────────────────────────────────────────────────────────
// Chatter Studio — utilities
// ─────────────────────────────────────────────────────────────

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const uid = (p = 'id') => p + '-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const deepClone = (o) => JSON.parse(JSON.stringify(o));

export const ease = {
  linear: (t) => t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  in: (t) => t * t * t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  elastic: (t) => {
    if (t === 0 || t === 1) return t;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
};
export const EASE_NAMES = ['linear', 'out', 'outQuint', 'in', 'inOut', 'back', 'elastic'];

/** Deterministic PRNG (mulberry32) seeded from a string. */
export function seeded(seedStr) {
  let h = 1779033703 ^ String(seedStr).length;
  for (let i = 0; i < String(seedStr).length; i++) {
    h = Math.imul(h ^ String(seedStr).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** HH:MM:SS:FF timecode */
export function timecode(sec, fps = 24) {
  sec = Math.max(0, sec);
  const total = Math.round(sec * fps);
  const f = total % fps;
  const s = Math.floor(total / fps) % 60;
  const m = Math.floor(total / (fps * 60)) % 60;
  const h = Math.floor(total / (fps * 3600));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}:${p(f)}`;
}

export const snapFrame = (sec, fps) => Math.round(sec * fps) / fps;

export function fmtSec(sec) {
  return (Math.round(sec * 1000) / 1000).toFixed(2) + 's';
}

/** Clock-time helper: "9:41 PM" + minutes → "9:43 PM" */
export function clockAdd(base, addMinutes) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(String(base).trim());
  if (!m) return base;
  let h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
  const ap = (m[3] || '').toUpperCase();
  let h24 = h;
  if (ap === 'PM' && h !== 12) h24 = h + 12;
  if (ap === 'AM' && h === 12) h24 = 0;
  let total = h24 * 60 + mi + Math.round(addMinutes);
  total = ((total % 1440) + 1440) % 1440;
  const nh = Math.floor(total / 60), nm = total % 60;
  if (!ap) return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
  const sfx = nh >= 12 ? 'PM' : 'AM';
  let h12 = nh % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${String(nm).padStart(2, '0')} ${sfx}`;
}

export const IMG_RE = /\.(png|jpe?g|webp|gif|avif|bmp)(\?.*)?$/i;
export const URL_RE = /^(https?:\/\/|data:image\/|blob:|\.?\/|[\w .-]+\/)/i;

/** Does this string look like an image reference? */
export function looksLikeImage(s) {
  const t = String(s || '').trim();
  if (t.startsWith('data:image/')) return true;
  const first = t.split(/\s+/)[0];
  return IMG_RE.test(first) && URL_RE.test(first);
}

/* ───────── keyframe track evaluation ───────── */

/** Sort keyframes in place by time. */
export function sortKfs(track) {
  track.sort((a, b) => a.t - b.t);
  return track;
}

/** Step (discrete) track value at time t — used for name / status / text values. */
export function evalStep(track, t, fallback = null) {
  if (!track || !track.length) return fallback;
  let v = track[0].t <= t ? track[0].v : fallback;
  for (const k of track) { if (k.t <= t) v = k.v; else break; }
  return v;
}

/** Interpolated numeric/object track value at time t. */
export function evalNum(track, t, fallback = 0) {
  if (!track || !track.length) return fallback;
  if (t <= track[0].t) return track[0].v;
  if (t >= track[track.length - 1].t) return track[track.length - 1].v;
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i], b = track[i + 1];
    if (t >= a.t && t <= b.t) {
      const p = invLerp(a.t, b.t, t);
      const fn = ease[a.ease || 'inOut'] || ease.inOut;
      return lerp(a.v, b.v, fn(p));
    }
  }
  return fallback;
}

/** Interpolate an object of numbers across keyframes ({x,y,scale,rot}). */
export function evalObj(track, t, fallback) {
  if (!track || !track.length) return { ...fallback };
  const first = track[0], last = track[track.length - 1];
  if (t <= first.t) return { ...fallback, ...first.v };
  if (t >= last.t) return { ...fallback, ...last.v };
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i], b = track[i + 1];
    if (t >= a.t && t <= b.t) {
      const p = invLerp(a.t, b.t, t);
      const fn = ease[a.ease || 'inOut'] || ease.inOut;
      const e = fn(p);
      const out = { ...fallback };
      for (const key of Object.keys(fallback)) {
        const av = a.v[key] !== undefined ? a.v[key] : fallback[key];
        const bv = b.v[key] !== undefined ? b.v[key] : fallback[key];
        out[key] = typeof av === 'number' && typeof bv === 'number' ? lerp(av, bv, e) : av;
      }
      return out;
    }
  }
  return { ...fallback };
}

/* ───────── misc DOM ───────── */
export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) {
    if (k === null || k === undefined || k === false) continue;
    n.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
  }
  return n;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

export function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

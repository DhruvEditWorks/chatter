// ─────────────────────────────────────────────────────────────
// Project model + auto-timing engine
// ─────────────────────────────────────────────────────────────

import { uid, clamp, snapFrame, sortKfs } from './util.js';
import { invalidateLayout } from './layout.js';
import { invalidateChain } from './renderer.js';

export const OUT_PRESETS = [
  { id: '2k-scope', label: '2048 × 858 — 2K Scope (2.39:1)', w: 2048, h: 858 },
  { id: 'hd-scope', label: '1920 × 804 — HD Scope (2.39:1)', w: 1920, h: 804 },
  { id: 'uhd-scope', label: '3840 × 1608 — UHD Scope (2.39:1)', w: 3840, h: 1608 },
  { id: '4k-dci-scope', label: '4096 × 1716 — 4K DCI Scope (2.39:1)', w: 4096, h: 1716 },
  { id: '25k-scope', label: '2560 × 1072 — 2.5K Scope (2.39:1)', w: 2560, h: 1072 },
  { id: 'uhd', label: '3840 × 2160 — UHD 16:9', w: 3840, h: 2160 },
  { id: 'hd', label: '1920 × 1080 — HD 16:9', w: 1920, h: 1080 },
  { id: 'vert', label: '1080 × 1920 — Vertical 9:16', w: 1080, h: 1920 },
];

export const DEVICE_PRESETS = [
  { id: 'iphone15', label: 'iPhone 15 Pro — 1179 × 2556', w: 1179, h: 2556, radius: 180 },
  { id: 'iphone13', label: 'iPhone 13/14 — 1170 × 2532', w: 1170, h: 2532, radius: 170 },
  { id: 'android', label: 'Android FHD+ — 1080 × 2340', w: 1080, h: 2340, radius: 120 },
  { id: 'tall', label: 'Tall screen — 1080 × 2400', w: 1080, h: 2400, radius: 0 },
  { id: 'square', label: 'Screen-recording 1080 × 1920', w: 1080, h: 1920, radius: 0 },
];

export const DEFAULT_TIMING = {
  startAt: 0.6,
  preType: 0.55,       // pause before I start typing
  typeSpeed: 11,       // chars / sec
  typeMin: 0.45, typeMax: 6.5,
  sendDelay: 0.14,     // typing finished → bubble appears
  afterMine: 0.55,     // pause after my message
  think: 0.75,         // their pause before the three dots start
  dotsSpeed: 10,       // chars / sec → dots duration
  dotsMin: 0.7, dotsMax: 4.5,
  dotsToMsg: 0.12,
  afterTheirs: 0.85,
  tail: 2.0,           // extra time after the last message
  delivered: 0.45,     // ticks: delivered offset from appear
  read: 1.5,           // ticks: read offset from appear
};

export const DEFAULT_UI = {
  defaultAnim: 'pop',
  animDur: 0.32,
  scrollDur: 0.38,
  headerTyping: true,
  dotsBubble: true,
  typingLabel: 'typing…',
  typingColor: null,
  onlineLabel: 'Online',
  lastSeenPrefix: 'last seen ',
  statusBarTime: '9:41',
  battery: 78,
  showCaret: true,
};

export function newScene(name = 'Chat') {
  return {
    id: uid('sc'),
    contactName: name,
    contactAvatar: null,
    meName: 'Me',
    meAvatar: null,
    wallpaper: null,
    clock: '9:41 PM',
    theme: null,              // null → inherit project theme
    themeOverrides: null,
    timing: { ...DEFAULT_TIMING },
    ui: { ...DEFAULT_UI },
    messages: [],
    tracks: { status: [{ t: 0, v: { mode: 'online' } }], scroll: [], camera: [] },
  };
}

export function newProject() {
  const p = {
    version: 2,
    name: 'Untitled chat',
    out: { w: 2048, h: 858, fps: 24, bg: 'transparent', duration: 20, autoDuration: true },
    // default = full-bleed overlay: the UI *is* the frame (no phone bezel)
    device: { w: 2048, h: 858, radius: 0, fit: 'height', zoom: 1, link: true },
    theme: 'film-overlay',
    themeOverrides: {},
    scenes: [newScene('Amaira')],
    active: 0,
  };
  return p;
}

/** Normalise a project loaded from JSON / older versions. */
export function hydrate(p) {
  p.out = { bg: 'transparent', autoDuration: true, ...p.out };
  p.device = { radius: 0, fit: 'height', zoom: 1, ...p.device };
  if (p.device.link === undefined) p.device.link = p.device.w === p.out.w && p.device.h === p.out.h;
  p.themeOverrides = p.themeOverrides || {};
  p.scenes = (p.scenes || []).map((s) => {
    const sc = { ...newScene(s.contactName || 'Chat'), ...s };
    sc.timing = { ...DEFAULT_TIMING, ...(s.timing || {}) };
    sc.ui = { ...DEFAULT_UI, ...(s.ui || {}) };
    sc.tracks = { status: [], scroll: [], camera: [], ...(s.tracks || {}) };
    sc.messages = (s.messages || []).map((m) => ({ showDots: true, showTypeInBar: true, ...m }));
    return sc;
  });
  if (!p.scenes.length) p.scenes = [newScene('Chat')];
  p.active = clamp(p.active || 0, 0, p.scenes.length - 1);
  return p;
}

/** Build a studio scene from a parsed script scene. */
export function sceneFromParsed(ps, base) {
  const sc = newScene(ps.contactName);
  if (base) { sc.timing = { ...base.timing }; sc.ui = { ...base.ui }; sc.theme = base.theme; sc.themeOverrides = base.themeOverrides; }
  sc.contactAvatar = ps.contactAvatar || (base && base.contactAvatar) || null;
  sc.meAvatar = ps.meAvatar || (base && base.meAvatar) || null;
  sc.meName = ps.meName || 'Me';
  sc.wallpaper = ps.wallpaper || (base && base.wallpaper) || null;
  sc.clock = ps.clock || '9:41 PM';
  sc.messages = ps.messages;
  sc._pendingStatus = ps.pendingStatus || [];
  retime(sc);
  // resolve @online/@offline directives → status keyframes
  if (sc._pendingStatus.length) {
    sc.tracks.status = [];
    for (const ps2 of sc._pendingStatus) {
      const t = ps2.afterIndex < 0 ? 0 : (sc.messages[ps2.afterIndex] ? sc.messages[ps2.afterIndex].appear + 0.15 : 0);
      sc.tracks.status.push({ t: Math.max(0, +t.toFixed(3)), v: ps2.v });
    }
    sortKfs(sc.tracks.status);
    if (!sc.tracks.status.length || sc.tracks.status[0].t > 0) sc.tracks.status.unshift({ t: 0, v: { mode: 'online' } });
  }
  delete sc._pendingStatus;
  return sc;
}

const vlen = (m) => Math.max(2, (m.text || '').length + (m.type === 'image' ? 26 : 0));

/** Recompute all automatic timings for a scene. Locked items keep their values. */
export function retime(sc, opts = {}) {
  const S = { ...DEFAULT_TIMING, ...(sc.timing || {}), ...opts };
  let cur = S.startAt;

  for (const m of sc.messages) {
    cur += m.gapBefore || 0;

    if (m.from === 'system') {
      if (!m.locked) m.appear = +cur.toFixed(3);
      m.animDur = m.animDur ?? 0.3;
      cur = Math.max(cur, m.appear) + (m.gapAfter != null ? m.gapAfter : 0.35);
      continue;
    }

    if (m.from === 'me') {
      const auto = m.optTypeDur != null ? +m.optTypeDur
        : clamp(vlen(m) / S.typeSpeed, S.typeMin, S.typeMax);
      if (!m.durLocked) m.typeDur = +auto.toFixed(3);
      if (!m.locked) {
        m.typeStart = +(cur + S.preType).toFixed(3);
        m.appear = +(m.typeStart + m.typeDur + S.sendDelay).toFixed(3);
      }
      m.dotsStart = null; m.dotsDur = null;
      if (!m.statusLocked) {
        m.tDelivered = +(m.appear + S.delivered).toFixed(3);
        m.tRead = +(m.appear + S.read).toFixed(3);
      }
      cur = Math.max(cur, m.appear) + (m.gapAfter != null ? m.gapAfter : S.afterMine);
    } else {
      const auto = m.optDotsDur != null ? +m.optDotsDur
        : clamp(vlen(m) / S.dotsSpeed, S.dotsMin, S.dotsMax);
      if (!m.durLocked) m.dotsDur = +auto.toFixed(3);
      if (!m.locked) {
        m.dotsStart = +(cur + S.think).toFixed(3);
        m.appear = +(m.dotsStart + (m.showDots === false ? 0 : m.dotsDur) + S.dotsToMsg).toFixed(3);
      }
      m.typeStart = null; m.typeDur = null;
      cur = Math.max(cur, m.appear) + (m.gapAfter != null ? m.gapAfter : S.afterTheirs);
    }
    m.animDur = m.animDur ?? null;
  }
  invalidate(sc);
  return sc;
}

/** Keep per-message times but push everything after `fromIdx` by delta. */
export function shiftFrom(sc, fromIdx, delta) {
  for (let i = fromIdx; i < sc.messages.length; i++) {
    const m = sc.messages[i];
    if (m.appear != null) m.appear = +(m.appear + delta).toFixed(3);
    if (m.typeStart != null) m.typeStart = +(m.typeStart + delta).toFixed(3);
    if (m.dotsStart != null) m.dotsStart = +(m.dotsStart + delta).toFixed(3);
    if (m.tDelivered != null) m.tDelivered = +(m.tDelivered + delta).toFixed(3);
    if (m.tRead != null) m.tRead = +(m.tRead + delta).toFixed(3);
  }
  invalidate(sc);
}

export function sceneEnd(sc) {
  let end = 0;
  for (const m of sc.messages) {
    end = Math.max(end, m.appear || 0, m.tRead || 0);
  }
  for (const k of [...(sc.tracks.status || []), ...(sc.tracks.camera || []), ...(sc.tracks.scroll || [])]) {
    end = Math.max(end, k.t);
  }
  return end;
}

export function projectDuration(p) {
  const sc = p.scenes[p.active];
  if (!sc) return p.out.duration || 10;
  if (!p.out.autoDuration) return p.out.duration;
  const S = { ...DEFAULT_TIMING, ...(sc.timing || {}) };
  return Math.max(2, +(sceneEnd(sc) + S.tail).toFixed(2));
}

export function invalidate(sc) {
  invalidateLayout(sc ? sc.id : null);
  invalidateChain(sc ? sc.id : null);
}

export function addMessage(sc, from, text, atIndex = null) {
  const m = {
    id: uid('m'), from, type: 'text', text: text || '', img: null,
    anim: null, animDur: null,
    typeStart: null, typeDur: null, dotsStart: null, dotsDur: null, appear: null,
    optTypeDur: null, optDotsDur: null, gapAfter: null, gapBefore: null,
    showDots: true, showTypeInBar: true, locked: false, durLocked: false, statusLocked: false,
    time: null, reaction: null,
  };
  if (atIndex == null || atIndex >= sc.messages.length) sc.messages.push(m);
  else sc.messages.splice(atIndex, 0, m);
  retime(sc);
  return m;
}

export function removeMessage(sc, id) {
  const i = sc.messages.findIndex((m) => m.id === id);
  if (i >= 0) { sc.messages.splice(i, 1); retime(sc); }
}

export function moveMessage(sc, id, dir) {
  const i = sc.messages.findIndex((m) => m.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sc.messages.length) return;
  const [m] = sc.messages.splice(i, 1);
  sc.messages.splice(j, 0, m);
  retime(sc);
}

export function snapScene(sc, fps) {
  for (const m of sc.messages) {
    for (const k of ['appear', 'typeStart', 'dotsStart', 'tDelivered', 'tRead']) {
      if (m[k] != null) m[k] = snapFrame(m[k], fps);
    }
  }
  for (const name of ['status', 'scroll', 'camera']) {
    for (const k of sc.tracks[name] || []) k.t = snapFrame(k.t, fps);
  }
  invalidate(sc);
}

/* ───────── persistence ───────── */

const LS_KEY = 'chatter-studio-project';

export function serialize(p) {
  const clone = JSON.parse(JSON.stringify(p, (k, v) => (k.startsWith('_') ? undefined : v)));
  return JSON.stringify(clone);
}

export function saveLocal(p) {
  try { localStorage.setItem(LS_KEY, serialize(p)); return true; }
  catch (e) { return false; }
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return hydrate(JSON.parse(raw));
  } catch (e) { return null; }
}

export function clearLocal() { try { localStorage.removeItem(LS_KEY); } catch (e) {} }

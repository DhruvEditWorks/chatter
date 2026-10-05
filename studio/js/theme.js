// ─────────────────────────────────────────────────────────────
// Themes — every number here is live-editable from the Theme panel,
// so the look can be pixel-matched to any reference screenshot.
// All metrics are in "pt" (a 390pt-wide design space). The renderer
// scales pt → device pixels, so themes are resolution independent.
// ─────────────────────────────────────────────────────────────

export const BASE_W = 390; // design width in pt

const FONT_STACK = "Inter, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif";

function mk(o) { return JSON.parse(JSON.stringify(o)); }

const WHATSAPP_DARK = {
  id: 'whatsapp-dark',
  label: 'WhatsApp — Dark',
  variant: 'whatsapp',
  font: FONT_STACK,
  screenBg: '#0b141a',
  wallpaperOpacity: 1,
  wallpaperTint: 'rgba(11,20,26,0.82)',
  deviceRadius: 0,

  statusBar: { show: true, h: 52, fg: '#ffffff', size: 15, weight: 600, padX: 26, icons: true },
  header: {
    show: true, h: 58, bg: '#202c33', fg: '#e9edef', sub: '#8696a0',
    nameSize: 16.5, nameWeight: 600, subSize: 12.5, avatar: 40, iconColor: '#aebac1',
    showBack: true, showActions: true, padX: 10, gap: 10, divider: 'rgba(255,255,255,0.06)',
  },
  list: { padX: 10, padTop: 12, padBottom: 10, gap: 2.5, gapGroup: 10 },
  bubble: {
    maxW: 0.76, radius: 8, tailRadius: 3, padX: 9, padY: 6.5,
    fontSize: 15.8, lineH: 20.5, timeSize: 11, timeGap: 6, tail: true,
    shadow: 'rgba(0,0,0,0.18)', shadowBlur: 1.2, shadowY: 1,
    inBg: '#202c33', inFg: '#e9edef', inTime: '#8696a0',
    outBg: '#005c4b', outFg: '#e9edef', outTime: 'rgba(233,237,239,0.6)',
    tickSent: 'rgba(233,237,239,0.6)', tickRead: '#53bdeb',
    imgRadius: 7, imgMaxW: 0.66, captionPad: 5,
  },
  dots: { bg: '#202c33', fg: '#8696a0', w: 62, h: 34, r: 8, dot: 3.4, gap: 6, amp: 3, speed: 1.1 },
  input: {
    show: true, h: 62, bg: '#0b141a', pill: '#202c33', fg: '#e9edef',
    placeholder: '#8696a0', placeholderText: 'Message', icon: '#8696a0',
    sendBg: '#00a884', sendFg: '#0b141a', radius: 22, fontSize: 15.8, padX: 8, pillPadX: 12, caret: '#00a884',
  },
  chip: { bg: 'rgba(32,44,51,0.92)', fg: '#8696a0', size: 12, radius: 7, padX: 10, padY: 5 },
};

const WHATSAPP_LIGHT = mk(WHATSAPP_DARK);
Object.assign(WHATSAPP_LIGHT, {
  id: 'whatsapp-light', label: 'WhatsApp — Light',
  screenBg: '#efeae2', wallpaperTint: 'rgba(239,234,226,0.6)',
});
Object.assign(WHATSAPP_LIGHT.statusBar, { fg: '#111b21' });
Object.assign(WHATSAPP_LIGHT.header, { bg: '#f0f2f5', fg: '#111b21', sub: '#667781', iconColor: '#54656f', divider: 'rgba(0,0,0,0.08)' });
Object.assign(WHATSAPP_LIGHT.bubble, {
  inBg: '#ffffff', inFg: '#111b21', inTime: '#667781',
  outBg: '#d9fdd3', outFg: '#111b21', outTime: 'rgba(17,27,33,0.45)',
  tickSent: 'rgba(17,27,33,0.45)', tickRead: '#53bdeb', shadow: 'rgba(11,20,26,0.13)',
});
Object.assign(WHATSAPP_LIGHT.dots, { bg: '#ffffff', fg: '#8696a0' });
Object.assign(WHATSAPP_LIGHT.input, { bg: '#f0f2f5', pill: '#ffffff', fg: '#111b21', placeholder: '#8696a0', icon: '#54656f' });
Object.assign(WHATSAPP_LIGHT.chip, { bg: '#ffffff', fg: '#5e6a71' });

const IMESSAGE_DARK = {
  id: 'imessage-dark',
  label: 'iMessage — Dark',
  variant: 'imessage',
  font: FONT_STACK,
  screenBg: '#000000',
  wallpaperOpacity: 1,
  wallpaperTint: 'rgba(0,0,0,0.0)',
  deviceRadius: 0,
  statusBar: { show: true, h: 54, fg: '#ffffff', size: 15.5, weight: 600, padX: 28, icons: true },
  header: {
    show: true, h: 86, bg: 'rgba(28,28,30,0.86)', fg: '#ffffff', sub: '#8e8e93',
    nameSize: 12.5, nameWeight: 600, subSize: 11, avatar: 50, iconColor: '#0a84ff',
    showBack: true, showActions: true, padX: 12, gap: 8, divider: 'rgba(255,255,255,0.12)',
    stacked: true,
  },
  list: { padX: 14, padTop: 12, padBottom: 10, gap: 3, gapGroup: 10 },
  bubble: {
    maxW: 0.72, radius: 18, tailRadius: 6, padX: 12, padY: 8,
    fontSize: 16.5, lineH: 21, timeSize: 10.5, timeGap: 6, tail: true,
    shadow: 'rgba(0,0,0,0)', shadowBlur: 0, shadowY: 0,
    inBg: '#26252a', inFg: '#ffffff', inTime: '#8e8e93',
    outBg: '#0a84ff', outFg: '#ffffff', outTime: 'rgba(255,255,255,0.7)',
    tickSent: 'rgba(255,255,255,0.6)', tickRead: '#ffffff',
    imgRadius: 16, imgMaxW: 0.62, captionPad: 5,
    hideTimeInBubble: true,
  },
  dots: { bg: '#26252a', fg: '#8e8e93', w: 64, h: 36, r: 18, dot: 4, gap: 7, amp: 2.5, speed: 1.2 },
  input: {
    show: true, h: 64, bg: 'rgba(0,0,0,0.9)', pill: '#1c1c1e', fg: '#ffffff',
    placeholder: '#636366', placeholderText: 'iMessage', icon: '#8e8e93',
    sendBg: '#0a84ff', sendFg: '#ffffff', radius: 18, fontSize: 16.5, padX: 12, pillPadX: 12, caret: '#0a84ff',
    pillStroke: 'rgba(255,255,255,0.18)',
  },
  chip: { bg: 'rgba(0,0,0,0)', fg: '#8e8e93', size: 11.5, radius: 7, padX: 8, padY: 4 },
};

const IMESSAGE_LIGHT = mk(IMESSAGE_DARK);
Object.assign(IMESSAGE_LIGHT, { id: 'imessage-light', label: 'iMessage — Light', screenBg: '#ffffff' });
Object.assign(IMESSAGE_LIGHT.statusBar, { fg: '#000000' });
Object.assign(IMESSAGE_LIGHT.header, { bg: 'rgba(249,249,249,0.9)', fg: '#000000', sub: '#8e8e93', iconColor: '#007aff', divider: 'rgba(0,0,0,0.14)' });
Object.assign(IMESSAGE_LIGHT.bubble, { inBg: '#e9e9eb', inFg: '#000000', outBg: '#007aff', outFg: '#ffffff' });
Object.assign(IMESSAGE_LIGHT.dots, { bg: '#e9e9eb', fg: '#8e8e93' });
Object.assign(IMESSAGE_LIGHT.input, { bg: 'rgba(255,255,255,0.95)', pill: '#ffffff', fg: '#000000', pillStroke: 'rgba(0,0,0,0.18)' });

const INSTAGRAM_DARK = mk(WHATSAPP_DARK);
Object.assign(INSTAGRAM_DARK, { id: 'instagram-dark', label: 'Instagram — Dark', variant: 'instagram', screenBg: '#000000', wallpaperTint: 'rgba(0,0,0,0.8)' });
Object.assign(INSTAGRAM_DARK.header, { bg: '#000000', fg: '#ffffff', sub: '#a8a8a8', iconColor: '#ffffff', h: 60, avatar: 34, nameSize: 16 });
Object.assign(INSTAGRAM_DARK.bubble, {
  radius: 20, tail: false, padX: 13, padY: 9, maxW: 0.7, hideTimeInBubble: true,
  inBg: '#262626', inFg: '#ffffff', outBg: '#3797f0', outFg: '#ffffff', shadow: 'rgba(0,0,0,0)',
});
Object.assign(INSTAGRAM_DARK.dots, { bg: '#262626', fg: '#a8a8a8', r: 18 });
Object.assign(INSTAGRAM_DARK.input, { bg: '#000000', pill: '#000000', pillStroke: '#262626', radius: 22, placeholderText: 'Message...', sendBg: '#3797f0' });

/* ─────────────────────────────────────────────────────────────
   FILM OVERLAY — matches the reference frame:
   full-bleed 2.39:1 glass UI composited straight over footage.
   No phone bezel, no status bar, transparent background, bubbles
   staggered left/right so twice as many fit in a scope frame.
   ───────────────────────────────────────────────────────────── */
const FILM_OVERLAY = {
  id: 'film-overlay',
  label: 'Film Overlay — Scope (reference)',
  variant: 'overlay',
  font: FONT_STACK,
  screenBg: 'transparent',
  wallpaperOpacity: 1,
  wallpaperTint: 'transparent',
  deviceRadius: 0,

  statusBar: { show: false, h: 0, fg: '#ffffff', size: 10, weight: 600, padX: 20, icons: false },

  header: {
    show: true, h: 28, bg: 'transparent', fg: '#ffffff', sub: '#4ade80',
    nameSize: 8.2, nameWeight: 700, subSize: 5.8, avatar: 23, iconColor: '#ffffff',
    showBack: false, showActions: true, padX: 20, gap: 7, divider: 'transparent',
    statusDot: '#22c55e', statusDotR: 1.6, statusDotGap: 2.6,
    avatarRing: 'rgba(255,255,255,0.92)', avatarRingW: 1.1,
    iconSize: 9.4, iconGap: 16, iconRightPad: 19,
    textShadow: 'rgba(0,0,0,0.55)', textShadowBlur: 3,
  },

  list: { padX: 19, padTop: 2, padBottom: 2, gap: 4.2, gapGroup: -6.5 },

  bubble: {
    maxW: 0.40, radius: 4.4, tailRadius: 1.4, padX: 5.6, padY: 2.55,
    fontSize: 7, lineH: 8.8, timeSize: 4.5, timeGap: 4.5, tail: true, tailEvery: true,
    tailW: 2.4, tailH: 3.2,
    shadow: 'rgba(0,0,0,0.42)', shadowBlur: 2.2, shadowY: 0.8,
    inBg: 'rgba(48,54,62,0.80)', inFg: '#ffffff', inTime: '#aab3bd',
    outBg: 'rgba(37,99,235,0.92)', outFg: '#ffffff', outTime: 'rgba(214,228,255,0.88)',
    tickSent: 'rgba(214,228,255,0.8)', tickRead: '#5aa9ff',
    imgRadius: 4.5, imgMaxW: 0.34, captionPad: 3.5,
  },

  dots: { bg: 'rgba(48,54,62,0.80)', fg: '#c9d1d9', w: 26, h: 13.9, r: 4.4, dot: 1.5, gap: 2.6, amp: 1.4, speed: 1.1 },

  input: {
    show: true, h: 18, bg: 'transparent', pill: 'rgba(24,28,34,0.55)', fg: '#ffffff',
    placeholder: '#b9bec4', placeholderText: 'Type a message...', icon: '#e8ebef',
    sendBg: '#2563eb', sendFg: '#ffffff', radius: 8, fontSize: 7, padX: 14, pillPadX: 7.5,
    caret: '#5aa9ff', pillStroke: 'rgba(255,255,255,0.22)', pillStrokeW: 0.5,
    leftPad: 14.5, rightPad: 28, pillH: 15.4, iconSize: 8.2, outerIconSize: 8.6,
  },

  chip: { bg: 'rgba(0,0,0,0.38)', fg: '#cfd6dd', size: 5.4, radius: 3.5, padX: 5.5, padY: 2.6 },
};

const FILM_OVERLAY_GREEN = mk(FILM_OVERLAY);
Object.assign(FILM_OVERLAY_GREEN, { id: 'film-overlay-green', label: 'Film Overlay — WhatsApp green' });
Object.assign(FILM_OVERLAY_GREEN.bubble, {
  outBg: 'rgba(0,92,75,0.90)', outTime: 'rgba(233,237,239,0.7)', tickRead: '#53bdeb',
});

export const THEMES = {
  'film-overlay': FILM_OVERLAY,
  'film-overlay-green': FILM_OVERLAY_GREEN,
  'whatsapp-dark': WHATSAPP_DARK,
  'whatsapp-light': WHATSAPP_LIGHT,
  'imessage-dark': IMESSAGE_DARK,
  'imessage-light': IMESSAGE_LIGHT,
  'instagram-dark': INSTAGRAM_DARK,
};

export function getTheme(id, overrides) {
  const base = mk(THEMES[id] || WHATSAPP_DARK);
  if (overrides) deepMerge(base, overrides);
  return base;
}

export function deepMerge(target, src) {
  for (const [k, v] of Object.entries(src || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (!target[k] || typeof target[k] !== 'object') target[k] = {};
      deepMerge(target[k], v);
    } else if (v !== undefined) {
      target[k] = v;
    }
  }
  return target;
}

/** Flat, labelled list of editable theme fields (for the Theme panel). */
export const THEME_FIELDS = [
  ['screenBg', 'Screen background', 'color'],
  ['wallpaperTint', 'Wallpaper tint', 'color'],
  ['header.bg', 'Header bg', 'color'],
  ['header.fg', 'Header name', 'color'],
  ['header.sub', 'Header status', 'color'],
  ['header.iconColor', 'Header icons', 'color'],
  ['header.h', 'Header height', 'num', 0, 160, 0.5],
  ['header.avatar', 'Header avatar size', 'num', 0, 80, 0.5],
  ['header.nameSize', 'Name size', 'num', 6, 40, 0.1],
  ['header.subSize', 'Status size', 'num', 6, 30, 0.1],
  ['statusBar.h', 'Status bar height', 'num', 0, 90, 0.5],
  ['statusBar.fg', 'Status bar color', 'color'],
  ['bubble.inBg', 'Incoming bubble', 'color'],
  ['bubble.inFg', 'Incoming text', 'color'],
  ['bubble.outBg', 'Outgoing bubble', 'color'],
  ['bubble.outFg', 'Outgoing text', 'color'],
  ['bubble.tickRead', 'Read tick', 'color'],
  ['bubble.radius', 'Bubble radius', 'num', 0, 32, 0.5],
  ['bubble.padX', 'Bubble pad X', 'num', 0, 30, 0.5],
  ['bubble.padY', 'Bubble pad Y', 'num', 0, 30, 0.5],
  ['bubble.fontSize', 'Message font size', 'num', 8, 36, 0.1],
  ['bubble.lineH', 'Line height', 'num', 8, 48, 0.1],
  ['bubble.maxW', 'Bubble max width', 'num', 0.3, 0.95, 0.01],
  ['bubble.timeSize', 'Timestamp size', 'num', 6, 20, 0.1],
  ['list.padX', 'List pad X', 'num', 0, 40, 0.5],
  ['list.gap', 'Gap (same sender)', 'num', 0, 24, 0.5],
  ['list.gapGroup', 'Gap (new sender)', 'num', 0, 40, 0.5],
  ['input.h', 'Input bar height', 'num', 0, 120, 0.5],
  ['input.bg', 'Input bar bg', 'color'],
  ['input.pill', 'Input pill bg', 'color'],
  ['input.fg', 'Input text', 'color'],
  ['input.placeholder', 'Placeholder color', 'color'],
  ['input.sendBg', 'Send button', 'color'],
  ['input.caret', 'Caret color', 'color'],
  ['dots.bg', 'Typing bubble bg', 'color'],
  ['dots.fg', 'Typing dots color', 'color'],
  ['header.statusDot', 'Online dot colour', 'color'],
  ['header.iconSize', 'Header icon size', 'num', 4, 40, 0.2],
  ['header.iconGap', 'Header icon gap', 'num', 2, 60, 0.5],
  ['header.padX', 'Header side pad', 'num', 0, 80, 0.5],
  ['input.leftPad', 'Input bar left pad', 'num', 0, 80, 0.5],
  ['input.rightPad', 'Input bar right pad', 'num', 0, 90, 0.5],
  ['input.pillH', 'Input pill height', 'num', 4, 60, 0.5],
  ['input.iconSize', 'Input icon size', 'num', 3, 36, 0.2],
];

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
export function setPath(obj, path, value) {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!o[parts[i]] || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
    o = o[parts[i]];
  }
  o[parts[parts.length - 1]] = value;
  return obj;
}

// ─────────────────────────────────────────────────────────────
// Chatter Studio — app wiring
// ─────────────────────────────────────────────────────────────

import {
  $, el, clamp, timecode, snapFrame, download, fileToDataURL, sortKfs, deepClone,
} from './util.js';
import { parseScript, sceneToScript, SAMPLE_SCRIPT } from './parser.js';
import {
  newProject, newScene, hydrate, sceneFromParsed, retime, projectDuration, invalidate,
  addMessage, removeMessage, moveMessage, snapScene, saveLocal, loadLocal, serialize,
  OUT_PRESETS, DEVICE_PRESETS, DEFAULT_TIMING,
} from './project.js';
import { renderFrame, ANIMS } from './renderer.js';
import { THEMES, THEME_FIELDS, getPath, setPath, getTheme } from './theme.js';
import { preloadAll, resolveSrc } from './assets.js';
import { Timeline } from './timeline.js';
import { exportSequence, exportStillPNG, exportWebM, slug, frameCount } from './exporter.js';

/* ───────── state ───────── */

const S = {
  proj: loadLocal() || bootstrap(),
  t: 0,
  playing: false,
  sel: null,         // selected message id
  selKf: null,       // {key,i}
  dirty: false,
};

function bootstrap() {
  const p = newProject();
  const { scenes } = parseScript(SAMPLE_SCRIPT);
  p.scenes = scenes.map((s) => sceneFromParsed(s, null));
  p.active = 0;
  return p;
}

const scene = () => S.proj.scenes[S.proj.active];
const dur = () => projectDuration(S.proj);

/* ───────── preview ───────── */

const cv = $('#preview');
const cx = cv.getContext('2d', { alpha: true });

function drawPreview() {
  const q = parseFloat($('#previewQ').value) || 1;
  const w = Math.max(16, Math.round(S.proj.out.w * q));
  const h = Math.max(16, Math.round(S.proj.out.h * q));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const proxy = { ...S.proj, out: { ...S.proj.out, w, h } };
  cx.imageSmoothingQuality = 'high';
  renderFrame(cx, proxy, S.t);
}

function updateTC() {
  const d = dur();
  $('#tc').textContent = timecode(S.t, S.proj.out.fps);
  $('#tcsub').textContent = `${S.t.toFixed(2)}s / ${d.toFixed(2)}s · f${Math.round(S.t * S.proj.out.fps)}`;
  $('#resBadge').textContent = `${S.proj.out.w}×${S.proj.out.h} · ${S.proj.out.fps}fps · ${(S.proj.out.w / S.proj.out.h).toFixed(2)}:1`;
}

function tick(quickOnly = false) {
  drawPreview();
  updateTC();
  tl.updatePlayhead(S.t);
  if (!quickOnly) { autosave(); }
}

let saveTimer = null;
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveLocal(S.proj); }, 700);
}

/* ───────── transport ───────── */

let rafId = null, lastTs = 0;
function play() {
  if (S.playing) return;
  S.playing = true;
  $('#btnPlay').textContent = '❚❚';
  $('#btnPlay').classList.add('on');
  lastTs = performance.now();
  const loop = (ts) => {
    if (!S.playing) return;
    const dt = Math.min(0.25, (ts - lastTs) / 1000);
    lastTs = ts;
    S.t += dt;
    const d = dur();
    if (S.t >= d) {
      if ($('#chkLoop').checked) S.t = 0; else { S.t = d; pause(); }
    }
    tick(true);
    tl.ensureVisible(S.t);
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}
function pause() {
  S.playing = false;
  $('#btnPlay').textContent = '▶';
  $('#btnPlay').classList.remove('on');
  cancelAnimationFrame(rafId);
}
function toggle() { S.playing ? pause() : play(); }
function seek(t) { S.t = clamp(t, 0, dur()); tick(true); }
function stepFrame(n) { seek(snapFrame(S.t, S.proj.out.fps) + n / S.proj.out.fps); }

/* ───────── timeline ───────── */

const tl = new Timeline({
  getProject: () => S.proj,
  getScene: () => scene(),
  getDuration: () => dur(),
  getTime: () => S.t,
  isRipple: () => $('#chkRipple').checked,
  isSnap: () => $('#chkSnap').checked,
  onSeek: (t) => seek(t),
  onChange: (quick) => { if (quick) { tick(true); buildInspector(); } else { refresh(); } },
  onSelectMsg: (id) => { S.sel = id; S.selKf = null; selectTab('#rightTabs', 'insp'); refreshLight(); },
  onSelectKf: (k) => { S.selKf = k; S.sel = null; selectTab('#rightTabs', 'insp'); refreshLight(); },
});

/* ───────── generic field helpers ───────── */

function fld(label, ...ctrl) { return el('div', { class: 'fld' }, el('label', {}, label), ...ctrl); }

function inputText(value, oninput, attrs = {}) {
  const n = el('input', { type: 'text', value: value ?? '', ...attrs });
  n.addEventListener('input', () => oninput(n.value));
  return n;
}
function inputNum(value, oninput, { min, max, step = 0.01 } = {}) {
  const n = el('input', { type: 'number', value: value ?? 0, step, ...(min != null ? { min } : {}), ...(max != null ? { max } : {}) });
  n.addEventListener('input', () => { const v = parseFloat(n.value); if (!isNaN(v)) oninput(v); });
  return n;
}
function inputColor(value, oninput) {
  const hex = toHex(value);
  const c = el('input', { type: 'color', value: hex });
  const t = el('input', { type: 'text', value: value ?? '', style: { flex: '1' } });
  c.addEventListener('input', () => { t.value = c.value; oninput(c.value); });
  t.addEventListener('input', () => { oninput(t.value); try { c.value = toHex(t.value); } catch (e) {} });
  return el('div', { style: { display: 'flex', gap: '6px', flex: '1', minWidth: 0 } }, c, t);
}
function toHex(v) {
  if (!v) return '#000000';
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) return '#' + v.slice(1).split('').map((c) => c + c).join('');
  const m = /rgba?\(([^)]+)\)/.exec(v);
  if (m) {
    const [r, g, b] = m[1].split(',').map((x) => clamp(Math.round(parseFloat(x)), 0, 255));
    return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  return '#000000';
}
function select(value, options, onchange) {
  const n = el('select', {}, ...options.map((o) => {
    const [val, lab] = Array.isArray(o) ? o : [o, o];
    return el('option', { value: val, ...(String(val) === String(value) ? { selected: true } : {}) }, lab);
  }));
  n.addEventListener('change', () => onchange(n.value));
  return n;
}
function checkbox(label, value, onchange) {
  const i = el('input', { type: 'checkbox', ...(value ? { checked: true } : {}) });
  i.addEventListener('change', () => onchange(i.checked));
  return el('label', { class: 'chk' }, i, label);
}
function sect(title) { return el('div', { class: 'sect' }, title); }

let pickCb = null;
$('#filePick').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (f && pickCb) await pickCb(f);
  pickCb = null;
});
function pickFile(accept, cb) { pickCb = cb; $('#filePick').accept = accept; $('#filePick').click(); }

function imageField(label, get, set, round = true) {
  const src = get();
  const img = el('img', { class: 'thumb' + (round ? '' : ' sq'), src: src ? resolveSrc(src) : '', alt: '' });
  const b1 = el('button', { class: 'btn sm' }, 'Upload');
  const b2 = el('button', { class: 'btn sm ghost' }, 'Clear');
  b1.addEventListener('click', () => pickFile('image/*', async (f) => {
    set(await fileToDataURL(f));
    await preloadAll(S.proj);
    refresh();
  }));
  b2.addEventListener('click', () => { set(null); refresh(); });
  const path = inputText(src && src.startsWith('data:') ? '(uploaded image)' : src || '', (v) => { set(v || null); preloadAll(S.proj).then(() => tick()); });
  return el('div', {},
    el('div', { class: 'fld' }, el('label', {}, label), img, b1, b2),
    el('div', { class: 'fld' }, el('label', {}, 'path / url'), path),
  );
}

/* ───────── left: script ───────── */

$('#btnSample').addEventListener('click', () => { $('#scriptBox').value = SAMPLE_SCRIPT; });
$('#btnImportTxt').addEventListener('click', () => pickFile('.txt,text/plain', async (f) => {
  $('#scriptBox').value = await f.text();
  toast('Script loaded — hit "Build timeline"');
}));
$('#btnFromScene').addEventListener('click', () => { $('#scriptBox').value = sceneToScript(scene()); });

$('#btnBuild').addEventListener('click', async () => {
  const src = $('#scriptBox').value;
  const { scenes, warnings } = parseScript(src, { meName: scene() ? scene().meName : 'Me' });
  if (!scenes.length) { $('#parseOut').className = 'hint warn'; $('#parseOut').textContent = warnings.join('\n'); return; }
  const base = scene();
  const built = scenes.map((s) => sceneFromParsed(s, base));
  if ($('#chkReplace').checked) { S.proj.scenes = built; S.proj.active = 0; }
  else { S.proj.scenes.push(...built); S.proj.active = S.proj.scenes.length - built.length; }
  S.sel = null;
  await preloadAll(S.proj);
  $('#parseOut').className = 'hint';
  $('#parseOut').textContent = `✓ ${built.length} scene(s), ${built.reduce((a, s) => a + s.messages.length, 0)} messages.`
    + (warnings.length ? '\n⚠ ' + warnings.join('\n⚠ ') : '');
  refresh();
  toast('Timeline built');
});

/* ───────── left: message list ───────── */

function buildMsgList() {
  const box = $('#msgList');
  box.innerHTML = '';
  const sc = scene();
  sc.messages.forEach((m, i) => {
    const cls = m.from === 'me' ? 'me' : m.from === 'them' ? 'them' : 'sys';
    const row = el('div', { class: `mrow ${cls}` + (m.id === S.sel ? ' sel' : '') },
      el('div', { class: 'side' }),
      el('div', { style: { flex: '1', minWidth: 0 } },
        el('div', { class: 'txt' }, (m.type === 'image' ? '🖼 ' : '') + (m.text || (m.img ? m.img.slice(0, 40) : '(empty)'))),
        el('div', { class: 'meta' }, `${(m.appear ?? 0).toFixed(2)}s`
          + (m.from === 'me' && m.typeDur ? ` · type ${m.typeDur.toFixed(2)}s` : '')
          + (m.from === 'them' && m.dotsDur && m.showDots !== false ? ` · dots ${m.dotsDur.toFixed(2)}s` : '')
          + (m.locked ? ' · 🔒' : '')),
      ),
      el('div', { class: 'acts' },
        btn('↑', () => { moveMessage(sc, m.id, -1); refresh(); }),
        btn('↓', () => { moveMessage(sc, m.id, 1); refresh(); }),
        btn('✕', () => { removeMessage(sc, m.id); if (S.sel === m.id) S.sel = null; refresh(); }),
      ),
    );
    row.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      S.sel = m.id; S.selKf = null;
      seek(Math.max(0, (m.appear ?? 0) - 0.4));
      selectTab('#rightTabs', 'insp');
      refreshLight();
    });
    box.appendChild(row);
  });
}
function btn(label, fn) { const b = el('button', {}, label); b.addEventListener('click', fn); return b; }

$('#btnAddThem').addEventListener('click', () => addAt('them'));
$('#btnAddMe').addEventListener('click', () => addAt('me'));
$('#btnAddSys').addEventListener('click', () => {
  const sc = scene();
  const m = addMessage(sc, 'system', 'Today');
  m.type = 'system'; m.kind = 'date';
  retime(sc); S.sel = m.id; refresh();
});
function addAt(from) {
  const sc = scene();
  const idx = S.sel ? sc.messages.findIndex((x) => x.id === S.sel) + 1 : sc.messages.length;
  const m = addMessage(sc, from, from === 'me' ? 'new message' : 'new reply', idx);
  S.sel = m.id;
  selectTab('#leftTabs', 'msgs');
  selectTab('#rightTabs', 'insp');
  refresh();
}

/* ───────── right: inspector ───────── */

function buildInspector() {
  const box = $('#inspBody');
  box.innerHTML = '';
  const sc = scene();

  if (S.selKf) {
    box.appendChild(kfEditor(sc, S.selKf));
    return;
  }

  const m = sc.messages.find((x) => x.id === S.sel);
  if (!m) {
    box.appendChild(el('div', { class: 'hint' }, 'Select a message in the list or on the timeline.\n\nTimeline: drag a bar to move it, drag its edges to change how long the typing / three-dots last.'));
    return;
  }

  box.appendChild(sect('Message'));
  box.appendChild(fld('From', select(m.from, [['them', `${sc.contactName} (incoming)`], ['me', `${sc.meName} (outgoing)`], ['system', 'System / date chip']], (v) => {
    m.from = v; m.type = v === 'system' ? 'system' : (m.img ? 'image' : 'text'); retime(sc); refresh();
  })));

  const ta = el('textarea', {}, m.text || '');
  ta.addEventListener('input', () => { m.text = ta.value; invalidate(sc); if (!m.durLocked) retime(sc); refreshLight(); tick(); });
  box.appendChild(fld('Text', ta));

  box.appendChild(imageField('Attachment', () => m.img, (v) => {
    m.img = v; m.type = v ? 'image' : 'text'; invalidate(sc); retime(sc);
  }, false));

  box.appendChild(fld('Clock label', inputText(m.time || '', (v) => { m.time = v || null; invalidate(sc); tick(); }), el('span', { class: 'unit' }, 'auto')));
  box.appendChild(fld('Reaction', inputText(m.reaction ? m.reaction.emoji : '', (v) => {
    m.reaction = v ? { emoji: v, t: m.reaction ? m.reaction.t : null } : null; invalidate(sc); tick();
  })));

  box.appendChild(sect('Appear animation'));
  box.appendChild(fld('Style', select(m.anim || '', [['', `scene default (${sc.ui.defaultAnim})`], ...ANIMS], (v) => { m.anim = v || null; tick(); })));
  box.appendChild(fld('Duration', inputNum(m.animDur ?? sc.ui.animDur, (v) => { m.animDur = v; tick(); }, { min: 0, max: 3, step: 0.01 }), el('span', { class: 'unit' }, 's')));

  box.appendChild(sect('Timing (keyframes)'));
  if (m.from === 'me') {
    box.appendChild(fld('Typing starts', inputNum(m.typeStart ?? 0, (v) => { m.typeStart = v; m.locked = true; sync(m, sc); }, { min: 0, step: 1 / S.proj.out.fps }), el('span', { class: 'unit' }, 's')));
    box.appendChild(fld('Typing lasts', inputNum(m.typeDur ?? 1, (v) => { m.typeDur = Math.max(0.05, v); m.durLocked = true; m.locked = true; m.appear = +(m.typeStart + m.typeDur + (sc.timing.sendDelay ?? 0.14)).toFixed(3); sync(m, sc); }, { min: 0.05, step: 0.01 }), el('span', { class: 'unit' }, 's')));
    box.appendChild(fld('', checkbox('show typing in the input bar', m.showTypeInBar !== false, (v) => { m.showTypeInBar = v; tick(); tl.render(); })));
  } else if (m.from === 'them') {
    box.appendChild(fld('Dots start', inputNum(m.dotsStart ?? 0, (v) => { m.dotsStart = v; m.locked = true; sync(m, sc); }, { min: 0, step: 1 / S.proj.out.fps }), el('span', { class: 'unit' }, 's')));
    box.appendChild(fld('Dots last', inputNum(m.dotsDur ?? 1, (v) => { m.dotsDur = Math.max(0.05, v); m.durLocked = true; m.locked = true; m.appear = +(m.dotsStart + m.dotsDur + (sc.timing.dotsToMsg ?? 0.12)).toFixed(3); sync(m, sc); }, { min: 0.05, step: 0.01 }), el('span', { class: 'unit' }, 's')));
    box.appendChild(fld('', checkbox('show three-dot typing bubble', m.showDots !== false, (v) => { m.showDots = v; retime(sc); refresh(); })));
  }
  box.appendChild(fld('Appears at', inputNum(m.appear ?? 0, (v) => { m.appear = v; m.locked = true; sync(m, sc); }, { min: 0, step: 1 / S.proj.out.fps }), el('span', { class: 'unit' }, 's')));

  if (m.from === 'me') {
    box.appendChild(sect('Read receipts'));
    box.appendChild(fld('Delivered ✓✓', inputNum(m.tDelivered ?? 0, (v) => { m.tDelivered = v; m.statusLocked = true; tick(); }, { step: 0.01 }), el('span', { class: 'unit' }, 's')));
    box.appendChild(fld('Read (blue)', inputNum(m.tRead ?? 0, (v) => { m.tRead = v; m.statusLocked = true; tick(); }, { step: 0.01 }), el('span', { class: 'unit' }, 's')));
  }

  box.appendChild(sect('Spacing (auto mode)'));
  box.appendChild(fld('Pause before', inputNum(m.gapBefore ?? 0, (v) => { m.gapBefore = v; retime(sc); refresh(); }, { min: 0, step: 0.05 }), el('span', { class: 'unit' }, 's')));
  box.appendChild(fld('Pause after', inputNum(m.gapAfter ?? '', (v) => { m.gapAfter = v; retime(sc); refresh(); }, { min: 0, step: 0.05 }), el('span', { class: 'unit' }, 's')));

  const lockRow = el('div', { class: 'row' },
    checkbox('lock times', !!m.locked, (v) => { m.locked = v; if (!v) retime(sc); refresh(); }),
    checkbox('lock durations', !!m.durLocked, (v) => { m.durLocked = v; if (!v) retime(sc); refresh(); }),
  );
  box.appendChild(sect('Locks'));
  box.appendChild(lockRow);
  box.appendChild(el('div', { class: 'hint' }, 'Locked messages are never moved by "Auto re-time all". Dragging on the timeline locks automatically.'));

  const b = el('button', { class: 'btn sm ghost wide' }, 'Jump playhead here');
  b.addEventListener('click', () => seek(Math.max(0, (m.appear ?? 0) - 0.3)));
  box.appendChild(b);
}

function sync(m, sc) { invalidate(sc); tick(); tl.render(); buildMsgList(); }

function kfEditor(sc, sel) {
  const tr = sc.tracks[sel.key] || [];
  const k = tr[sel.i];
  const box = el('div', {});
  if (!k) { box.appendChild(el('div', { class: 'hint' }, 'Keyframe removed.')); return box; }
  box.appendChild(sect(`${sel.key} keyframe`));
  box.appendChild(fld('Time', inputNum(k.t, (v) => { k.t = v; sortKfs(tr); invalidate(sc); tick(); tl.render(); }, { min: 0, step: 1 / S.proj.out.fps }), el('span', { class: 'unit' }, 's')));
  if (sel.key === 'status') {
    box.appendChild(fld('Mode', select(k.v.mode, [['online', 'online'], ['offline', 'offline / blank'], ['lastseen', 'last seen …'], ['typing', 'typing…'], ['custom', 'custom text']], (v) => { k.v.mode = v; tick(); buildInspector(); buildSceneTab(); })));
    if (['lastseen', 'typing', 'custom'].includes(k.v.mode)) {
      box.appendChild(fld('Text', inputText(k.v.text || '', (v) => { k.v.text = v; tick(); })));
    }
  } else if (sel.key === 'camera') {
    for (const [key, label, step] of [['x', 'Center X (0-1)', 0.005], ['y', 'Center Y (0-1)', 0.005], ['scale', 'Scale', 0.01], ['rot', 'Rotation °', 0.1], ['opacity', 'Opacity', 0.01]]) {
      box.appendChild(fld(label, inputNum(k.v[key] ?? (key === 'scale' || key === 'opacity' ? 1 : key === 'rot' ? 0 : 0.5), (v) => { k.v[key] = v; tick(); }, { step })));
    }
    box.appendChild(fld('Ease', select(k.ease || 'inOut', ['linear', 'out', 'outQuint', 'in', 'inOut', 'back'], (v) => { k.ease = v; tick(); })));
  } else {
    box.appendChild(fld('Scroll offset', inputNum(k.v, (v) => { k.v = v; tick(); }, { step: 1 }), el('span', { class: 'unit' }, 'pt')));
    box.appendChild(fld('Ease', select(k.ease || 'inOut', ['linear', 'out', 'inOut'], (v) => { k.ease = v; tick(); })));
  }
  const del = el('button', { class: 'btn sm danger wide' }, 'Delete keyframe');
  del.addEventListener('click', () => { tr.splice(sel.i, 1); S.selKf = null; refresh(); });
  box.appendChild(del);
  return box;
}

/* ───────── right: scene ───────── */

function buildSceneTab() {
  const box = $('#sceneBody');
  box.innerHTML = '';
  const sc = scene();

  box.appendChild(sect('Contact'));
  box.appendChild(fld('Name', inputText(sc.contactName, (v) => { sc.contactName = v; invalidate(sc); tick(); fillSceneSelect(); })));
  box.appendChild(imageField('Profile pic', () => sc.contactAvatar, (v) => { sc.contactAvatar = v; }));
  box.appendChild(fld('My name', inputText(sc.meName, (v) => { sc.meName = v; tick(); })));
  box.appendChild(imageField('My pic', () => sc.meAvatar, (v) => { sc.meAvatar = v; }));
  box.appendChild(imageField('Wallpaper', () => sc.wallpaper, (v) => { sc.wallpaper = v; }, false));

  box.appendChild(sect('Chrome'));
  box.appendChild(fld('Bubble clock', inputText(sc.clock, (v) => { sc.clock = v; invalidate(sc); tick(); })));
  box.appendChild(fld('Status-bar time', inputText(sc.ui.statusBarTime, (v) => { sc.ui.statusBarTime = v; tick(); })));
  box.appendChild(fld('Battery %', inputNum(sc.ui.battery, (v) => { sc.ui.battery = v; tick(); }, { min: 0, max: 100, step: 1 })));
  box.appendChild(fld('Typing label', inputText(sc.ui.typingLabel, (v) => { sc.ui.typingLabel = v; tick(); })));
  box.appendChild(el('div', { class: 'row' },
    checkbox('"typing…" in header', sc.ui.headerTyping !== false, (v) => { sc.ui.headerTyping = v; tick(); }),
    checkbox('three-dot bubble', sc.ui.dotsBubble !== false, (v) => { sc.ui.dotsBubble = v; invalidate(sc); tick(); }),
  ));
  box.appendChild(el('div', { class: 'row' },
    checkbox('show caret', sc.ui.showCaret !== false, (v) => { sc.ui.showCaret = v; tick(); }),
  ));

  box.appendChild(sect('Default appear animation'));
  box.appendChild(fld('Style', select(sc.ui.defaultAnim, ANIMS, (v) => { sc.ui.defaultAnim = v; tick(); })));
  box.appendChild(fld('Duration', inputNum(sc.ui.animDur, (v) => { sc.ui.animDur = v; tick(); }, { min: 0, max: 2, step: 0.01 }), el('span', { class: 'unit' }, 's')));
  box.appendChild(fld('Scroll glide', inputNum(sc.ui.scrollDur, (v) => { sc.ui.scrollDur = v; invalidate(sc); tick(); }, { min: 0, max: 2, step: 0.01 }), el('span', { class: 'unit' }, 's')));

  box.appendChild(sect('Presence keyframes (online / offline)'));
  box.appendChild(kfList(sc, 'status'));
  box.appendChild(addKfBtn(sc, 'status', 'Add presence keyframe at playhead'));

  box.appendChild(sect('Camera keyframes (pan / zoom / rotate)'));
  box.appendChild(kfList(sc, 'camera'));
  box.appendChild(addKfBtn(sc, 'camera', 'Add camera keyframe at playhead'));

  box.appendChild(sect('Manual scroll keyframes'));
  box.appendChild(kfList(sc, 'scroll'));
  box.appendChild(addKfBtn(sc, 'scroll', 'Add scroll keyframe at playhead'));
}

function kfList(sc, key) {
  const wrap = el('div', { class: 'kflist' });
  const tr = sc.tracks[key] || [];
  if (!tr.length) wrap.appendChild(el('div', { class: 'hint' }, 'none yet — add one, or double-click the track in the timeline.'));
  tr.forEach((k, i) => {
    const row = el('div', { class: 'kfrow' });
    row.appendChild(inputNum(k.t, (v) => { k.t = v; sortKfs(tr); invalidate(sc); tick(); tl.render(); }, { min: 0, step: 1 / S.proj.out.fps }));
    if (key === 'status') {
      row.appendChild(select(k.v.mode, ['online', 'offline', 'lastseen', 'typing', 'custom'], (v) => { k.v.mode = v; tick(); buildSceneTab(); }));
      if (['lastseen', 'typing', 'custom'].includes(k.v.mode)) row.appendChild(inputText(k.v.text || '', (v) => { k.v.text = v; tick(); }));
    } else if (key === 'camera') {
      row.appendChild(el('span', { class: 'hint', style: { flex: '1' } }, `x${(k.v.x ?? .5).toFixed(2)} y${(k.v.y ?? .5).toFixed(2)} ×${(k.v.scale ?? 1).toFixed(2)} ${(k.v.rot ?? 0).toFixed(1)}°`));
      const e = el('button', { class: 'btn sm ghost' }, 'edit');
      e.addEventListener('click', () => { S.selKf = { key, i }; S.sel = null; selectTab('#rightTabs', 'insp'); refreshLight(); });
      row.appendChild(e);
    } else {
      row.appendChild(inputNum(k.v, (v) => { k.v = v; tick(); }, { step: 1 }));
    }
    const x = el('button', { class: 'x' }, '✕');
    x.addEventListener('click', () => { tr.splice(i, 1); invalidate(sc); refresh(); });
    row.appendChild(x);
    wrap.appendChild(row);
  });
  return wrap;
}

function addKfBtn(sc, key, label) {
  const b = el('button', { class: 'btn sm wide' }, label);
  b.addEventListener('click', () => {
    const tr = (sc.tracks[key] = sc.tracks[key] || []);
    const t = +S.t.toFixed(3);
    if (key === 'status') tr.push({ t, v: { mode: 'online' } });
    else if (key === 'camera') tr.push({ t, v: { x: 0.5, y: 0.5, scale: 1, rot: 0, opacity: 1 }, ease: 'inOut' });
    else tr.push({ t, v: 0, ease: 'inOut' });
    sortKfs(tr); invalidate(sc); refresh();
  });
  return b;
}

/* ───────── right: look / theme ───────── */

function buildThemeTab() {
  const box = $('#themeBody');
  box.innerHTML = '';
  const sc = scene();

  box.appendChild(sect('Preset'));
  box.appendChild(fld('Theme', select(sc.theme || S.proj.theme, Object.values(THEMES).map((t) => [t.id, t.label]), (v) => {
    sc.theme = v; sc.themeOverrides = {}; invalidate(sc); refresh();
  })));
  const reset = el('button', { class: 'btn sm ghost wide' }, 'Reset all tweaks');
  reset.addEventListener('click', () => { sc.themeOverrides = {}; invalidate(sc); refresh(); });
  box.appendChild(reset);

  box.appendChild(sect('Toggles'));
  const th = getTheme(sc.theme || S.proj.theme, sc.themeOverrides);
  for (const [path, label] of [['statusBar.show', 'Status bar'], ['header.show', 'Header'], ['input.show', 'Input bar'], ['bubble.tail', 'Bubble tails'], ['bubble.hideTimeInBubble', 'Hide timestamps']]) {
    box.appendChild(el('div', { class: 'row' }, checkbox(label, !!getPath(th, path), (v) => {
      sc.themeOverrides = sc.themeOverrides || {}; setPath(sc.themeOverrides, path, v); invalidate(sc); tick();
    })));
  }
  box.appendChild(fld('Placeholder', inputText(th.input.placeholderText, (v) => {
    sc.themeOverrides = sc.themeOverrides || {}; setPath(sc.themeOverrides, 'input.placeholderText', v); tick();
  })));

  box.appendChild(sect('Fine tune (pixel-match your reference)'));
  for (const f of THEME_FIELDS) {
    const [path, label, kind, min, max, step] = f;
    const cur = getPath(th, path);
    if (kind === 'color') {
      box.appendChild(fld(label, inputColor(cur, (v) => {
        sc.themeOverrides = sc.themeOverrides || {}; setPath(sc.themeOverrides, path, v); invalidate(sc); tick();
      })));
    } else {
      box.appendChild(fld(label, inputNum(cur, (v) => {
        sc.themeOverrides = sc.themeOverrides || {}; setPath(sc.themeOverrides, path, v); invalidate(sc); tick();
      }, { min, max, step })));
    }
  }
}

/* ───────── right: timing ───────── */

function buildTimingTab() {
  const box = $('#timingBody');
  box.innerHTML = '';
  const sc = scene();
  const T = sc.timing;

  box.appendChild(el('div', { class: 'hint' }, 'These drive the automatic layout. Anything you drag on the timeline gets locked and is left alone.'));

  const rows = [
    ['startAt', 'First beat at', 's', 0, 30, 0.05],
    ['preType', 'Pause before I type', 's', 0, 10, 0.05],
    ['typeSpeed', 'My typing speed', 'ch/s', 1, 40, 0.5],
    ['typeMin', 'Min typing time', 's', 0.1, 10, 0.05],
    ['typeMax', 'Max typing time', 's', 0.2, 20, 0.05],
    ['sendDelay', 'Type → send gap', 's', 0, 3, 0.01],
    ['afterMine', 'Pause after my msg', 's', 0, 10, 0.05],
    ['think', 'Their think time', 's', 0, 10, 0.05],
    ['dotsSpeed', 'Their typing speed', 'ch/s', 1, 40, 0.5],
    ['dotsMin', 'Min dots time', 's', 0.1, 10, 0.05],
    ['dotsMax', 'Max dots time', 's', 0.2, 20, 0.05],
    ['dotsToMsg', 'Dots → reply gap', 's', 0, 3, 0.01],
    ['afterTheirs', 'Pause after their msg', 's', 0, 10, 0.05],
    ['delivered', 'Delivered after', 's', 0, 10, 0.05],
    ['read', 'Read (blue) after', 's', 0, 20, 0.05],
    ['tail', 'Hold at end', 's', 0, 20, 0.1],
  ];
  for (const [k, label, unit, min, max, step] of rows) {
    box.appendChild(fld(label, inputNum(T[k], (v) => { T[k] = v; retime(sc); refresh(); }, { min, max, step }), el('span', { class: 'unit' }, unit)));
  }

  const b = el('button', { class: 'btn primary wide' }, 'Auto re-time all (keeps locked)');
  b.addEventListener('click', () => { retime(sc); refresh(); toast('Re-timed'); });
  box.appendChild(b);
  const b2 = el('button', { class: 'btn sm ghost wide' }, 'Unlock everything');
  b2.addEventListener('click', () => { sc.messages.forEach((m) => { m.locked = false; m.durLocked = false; m.statusLocked = false; }); retime(sc); refresh(); });
  box.appendChild(b2);
  const b3 = el('button', { class: 'btn sm ghost wide' }, 'Snap everything to frames');
  b3.addEventListener('click', () => { snapScene(sc, S.proj.out.fps); refresh(); });
  box.appendChild(b3);
}

/* ───────── right: output ───────── */

function buildOutputTab() {
  const box = $('#outBody');
  box.innerHTML = '';
  const o = S.proj.out, d = S.proj.device;

  const syncDev = () => { if (d.link) { d.w = o.w; d.h = o.h; invalidate(scene()); } };

  box.appendChild(sect('Render frame'));
  box.appendChild(fld('Preset', select('', [['', 'custom…'], ...OUT_PRESETS.map((p) => [p.id, p.label])], (v) => {
    const p = OUT_PRESETS.find((x) => x.id === v);
    if (p) { o.w = p.w; o.h = p.h; syncDev(); refresh(); }
  })));
  box.appendChild(fld('Width', inputNum(o.w, (v) => { o.w = Math.round(v); syncDev(); tick(); updateTC(); }, { min: 16, step: 1 }), el('span', { class: 'unit' }, 'px')));
  box.appendChild(fld('Height', inputNum(o.h, (v) => { o.h = Math.round(v); syncDev(); tick(); updateTC(); }, { min: 16, step: 1 }), el('span', { class: 'unit' }, 'px')));
  box.appendChild(fld('Frame rate', select(o.fps, [[23.976, '23.976'], [24, '24'], [25, '25'], [29.97, '29.97'], [30, '30'], [48, '48'], [50, '50'], [60, '60']], (v) => { o.fps = parseFloat(v); refresh(); }), el('span', { class: 'unit' }, 'fps')));
  box.appendChild(fld('Background', select(o.bg, [['transparent', 'transparent (alpha)'], ['#000000', 'black'], ['#ffffff', 'white'], ['#00b140', 'green screen'], ['#0b141a', 'app background']], (v) => { o.bg = v; tick(); })));
  box.appendChild(el('div', { class: 'hint' }, `Aspect ${(o.w / o.h).toFixed(3)}:1 ${Math.abs(o.w / o.h - 2.39) < 0.02 ? '✓ 2.39 scope' : ''}`));

  box.appendChild(sect('Duration'));
  box.appendChild(el('div', { class: 'row' }, checkbox('auto (last message + hold)', o.autoDuration !== false, (v) => { o.autoDuration = v; refresh(); })));
  if (o.autoDuration === false) {
    box.appendChild(fld('Duration', inputNum(o.duration, (v) => { o.duration = v; refresh(); }, { min: 0.5, step: 0.1 }), el('span', { class: 'unit' }, 's')));
  }
  box.appendChild(el('div', { class: 'hint' }, `${dur().toFixed(2)}s → ${frameCount(S.proj, dur())} frames @ ${o.fps}fps`));

  box.appendChild(sect('UI surface'));
  box.appendChild(el('div', { class: 'row' }, checkbox('full-bleed overlay — UI fills the frame', !!d.link, (v) => {
    d.link = v; if (v) { d.w = o.w; d.h = o.h; d.radius = 0; d.fit = 'height'; d.zoom = 1; }
    invalidate(scene()); refresh();
  })));
  box.appendChild(el('div', { class: 'hint' }, d.link
    ? 'Overlay mode: the chat UI is the whole 2.39 frame, transparent behind — composite straight over footage.'
    : 'Phone mode: the UI is a phone screen placed inside the frame. Use the camera keyframes to move it.'));
  box.appendChild(fld('Device', select('', [['', 'custom…'], ...DEVICE_PRESETS.map((p) => [p.id, p.label])], (v) => {
    const p = DEVICE_PRESETS.find((x) => x.id === v);
    if (p) { d.link = false; d.w = p.w; d.h = p.h; d.radius = p.radius || 0; refresh(); }
  })));
  box.appendChild(fld('Screen W', inputNum(d.w, (v) => { d.w = Math.round(v); invalidate(scene()); tick(); }, { min: 100, step: 1 }), el('span', { class: 'unit' }, 'px')));
  box.appendChild(fld('Screen H', inputNum(d.h, (v) => { d.h = Math.round(v); invalidate(scene()); tick(); }, { min: 100, step: 1 }), el('span', { class: 'unit' }, 'px')));
  box.appendChild(fld('Corner radius', inputNum(d.radius, (v) => { d.radius = v; tick(); }, { min: 0, max: 400, step: 1 }), el('span', { class: 'unit' }, 'px')));
  box.appendChild(fld('Fit', select(d.fit, [['height', 'fit height (full phone)'], ['contain', 'contain'], ['width', 'fit width'], ['cover', 'cover / crop'], ['actual', '1:1 pixels']], (v) => { d.fit = v; tick(); })));
  box.appendChild(fld('Base zoom', inputNum(d.zoom, (v) => { d.zoom = v; tick(); }, { min: 0.05, max: 6, step: 0.01 }), el('span', { class: 'unit' }, '×')));

  const ff = el('button', { class: 'btn sm ghost wide' }, 'Make the UI fill the whole frame');
  ff.addEventListener('click', () => { d.link = true; d.w = o.w; d.h = o.h; d.fit = 'height'; d.zoom = 1; d.radius = 0; invalidate(scene()); refresh(); });
  box.appendChild(ff);

  box.appendChild(sect('Project'));
  const nw = el('button', { class: 'btn sm ghost wide' }, 'New empty project');
  nw.addEventListener('click', () => { if (confirm('Discard current project?')) { S.proj = newProject(); S.sel = null; S.t = 0; refresh(); } });
  box.appendChild(nw);
}

/* ───────── scene selector ───────── */

function fillSceneSelect() {
  const sel = $('#sceneSel');
  sel.innerHTML = '';
  S.proj.scenes.forEach((s, i) => {
    sel.appendChild(el('option', { value: i, ...(i === S.proj.active ? { selected: true } : {}) }, `${i + 1}. ${s.contactName} (${s.messages.length})`));
  });
}
$('#sceneSel').addEventListener('change', (e) => { S.proj.active = +e.target.value; S.sel = null; S.t = 0; refresh(); });
$('#btnSceneAdd').addEventListener('click', () => { S.proj.scenes.push(newScene('New chat')); S.proj.active = S.proj.scenes.length - 1; refresh(); });
$('#btnSceneDel').addEventListener('click', () => {
  if (S.proj.scenes.length <= 1) return toast('Need at least one scene', true);
  S.proj.scenes.splice(S.proj.active, 1);
  S.proj.active = clamp(S.proj.active, 0, S.proj.scenes.length - 1);
  refresh();
});

/* ───────── tabs ───────── */

function selectTab(navSel, name) {
  const nav = $(navSel);
  const panel = nav.parentElement;
  nav.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  panel.querySelectorAll('.tabpane').forEach((p) => p.classList.toggle('active', p.dataset.pane === name));
}
for (const navSel of ['#leftTabs', '#rightTabs']) {
  $(navSel).addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (t) selectTab(navSel, t.dataset.tab);
  });
}

/* ───────── refresh ───────── */

function refreshLight() {
  buildMsgList();
  buildInspector();
  tl.selMsg = S.sel; tl.selKf = S.selKf;
  tl.render();
  tick();
}

function refresh() {
  fillSceneSelect();
  buildMsgList();
  buildInspector();
  buildSceneTab();
  buildThemeTab();
  buildTimingTab();
  buildOutputTab();
  tl.selMsg = S.sel; tl.selKf = S.selKf;
  tl.render();
  tick();
}

/* ───────── toast ───────── */

let toastTimer;
function toast(msg, bad = false) {
  const n = $('#toast');
  n.textContent = msg;
  n.className = 'toast' + (bad ? ' bad' : '');
  n.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { n.hidden = true; }, 2600);
}

/* ───────── save / load ───────── */

$('#projName').addEventListener('input', (e) => { S.proj.name = e.target.value; autosave(); });
$('#btnSave').addEventListener('click', () => {
  download(new Blob([serialize(S.proj)], { type: 'application/json' }), `${slug(S.proj.name)}.chatproj.json`);
});
$('#btnLoad').addEventListener('click', () => pickFile('.json,.chatproj,application/json', async (f) => {
  try {
    S.proj = hydrate(JSON.parse(await f.text()));
    S.sel = null; S.t = 0;
    await preloadAll(S.proj);
    $('#projName').value = S.proj.name || 'Untitled';
    refresh();
    toast('Project loaded');
  } catch (e) { toast('Could not read that file', true); }
}));

/* ───────── export ───────── */

const exportState = { running: false, cancelRef: {} };

$('#btnExport').addEventListener('click', () => { pause(); openExport(); });

function openExport() {
  const m = $('#exportModal');
  const body = $('#exportBody');
  m.hidden = false;
  body.innerHTML = '';

  const o = S.proj.out;
  const d = dur();
  const cfg = {
    sink: window.showDirectoryPicker ? 'folder' : 'zip',
    format: 'png',
    start: 0,
    duration: d,
    prefix: slug(S.proj.name),
    padding: 5,
  };

  body.appendChild(el('div', { class: 'hint' },
    `${o.w} × ${o.h} · ${o.fps} fps · ${(o.w / o.h).toFixed(3)}:1 · background ${o.bg === 'transparent' ? 'ALPHA' : o.bg}`));

  body.appendChild(sect('Range'));
  body.appendChild(fld('Start', inputNum(cfg.start, (v) => { cfg.start = v; upd(); }, { min: 0, step: 1 / o.fps }), el('span', { class: 'unit' }, 's')));
  body.appendChild(fld('Length', inputNum(cfg.duration, (v) => { cfg.duration = v; upd(); }, { min: 1 / o.fps, step: 1 / o.fps }), el('span', { class: 'unit' }, 's')));

  body.appendChild(sect('Destination'));
  body.appendChild(fld('Write to', select(cfg.sink, [
    ...(window.showDirectoryPicker ? [['folder', 'a folder on disk (recommended)']] : []),
    ['zip', 'one .zip download'],
  ], (v) => { cfg.sink = v; upd(); })));
  body.appendChild(fld('Format', select(cfg.format, [['png', 'PNG · RGBA with alpha'], ['jpg', 'JPEG · no alpha, smaller']], (v) => { cfg.format = v; upd(); })));
  body.appendChild(fld('File prefix', inputText(cfg.prefix, (v) => { cfg.prefix = slug(v); upd(); })));
  body.appendChild(fld('Number padding', inputNum(cfg.padding, (v) => { cfg.padding = clamp(Math.round(v), 2, 8); upd(); }, { min: 2, max: 8, step: 1 })));

  const info = el('div', { class: 'hint' });
  body.appendChild(info);

  const prog = el('div', { class: 'bar2' }, el('i'));
  const progTxt = el('div', { class: 'hint' }, '');
  body.appendChild(prog); body.appendChild(progTxt);

  const btnGo = el('button', { class: 'btn primary' }, 'Export sequence');
  const btnStill = el('button', { class: 'btn ghost' }, 'Current frame PNG');
  const btnWebm = el('button', { class: 'btn ghost' }, 'WebM (alpha)');
  const btnCancel = el('button', { class: 'btn ghost' }, 'Cancel');
  const btnClose = el('button', { class: 'btn ghost' }, 'Close');
  body.appendChild(el('div', { class: 'row', style: { marginTop: '14px' } }, btnGo, btnStill, btnWebm, el('span', { class: 'sp' }), btnCancel, btnClose));

  body.appendChild(el('details', { class: 'help' },
    el('summary', {}, 'DaVinci Resolve import steps'),
    el('pre', {}, `1. Project Settings ▸ Master Settings
     Timeline resolution : ${o.w} x ${o.h}  (Custom)
     Timeline frame rate : ${o.fps}  ← set BEFORE importing
2. Drag the exported FOLDER into the Media Pool.
   Resolve auto-collapses numbered PNGs into one image-sequence clip.
3. Clip Attributes ▸ Video ▸ Frame Rate = ${o.fps} (if it guessed wrong)
   Clip Attributes ▸ Video ▸ Alpha Mode = Straight
4. Put the clip on a track above your footage — alpha composites directly.
5. Deliver: any codec. For a master with alpha use QuickTime ▸ ProRes 4444.`)));

  function upd() {
    const n = Math.max(1, Math.round(cfg.duration * o.fps));
    const perFrame = cfg.format === 'png' ? (o.w * o.h * 0.5) : (o.w * o.h * 0.12);
    info.textContent = `${n} frames · ~${fmtBytes(n * perFrame)} estimated`
      + (cfg.sink === 'zip' && n * perFrame > 1.6e9 ? '  ⚠ that is big for a single zip — use "folder on disk"' : '');
    btnCancel.disabled = !exportState.running;
    btnGo.disabled = exportState.running;
  }
  upd();

  btnClose.addEventListener('click', () => { m.hidden = true; });
  btnCancel.addEventListener('click', () => { exportState.cancelRef.cancel && exportState.cancelRef.cancel(); });
  btnStill.addEventListener('click', async () => { await exportStillPNG(S.proj, S.t); toast('Frame saved'); });
  btnWebm.addEventListener('click', async () => {
    exportState.running = true; upd();
    try {
      await exportWebM(S.proj, {
        duration: cfg.duration,
        onProgress: (p) => { prog.firstChild.style.width = p.pct + '%'; progTxt.textContent = `WebM ${p.frame}/${p.total}`; },
      });
      toast('WebM exported');
    } catch (e) { toast(e.message || 'WebM failed', true); }
    exportState.running = false; upd();
  });

  btnGo.addEventListener('click', async () => {
    exportState.running = true; upd();
    progTxt.textContent = 'preparing…';
    try {
      const res = await exportSequence(S.proj, {
        duration: cfg.duration,
        start: cfg.start,
        sink: cfg.sink,
        prefix: cfg.prefix,
        padding: cfg.padding,
        jpeg: cfg.format === 'jpg',
        cancelRef: exportState.cancelRef,
        onProgress: (p) => {
          prog.firstChild.style.width = p.pct.toFixed(1) + '%';
          progTxt.textContent = p.cancelled ? 'cancelled'
            : `frame ${p.frame}/${p.total} · ${p.pct.toFixed(1)}% · eta ${Math.ceil(p.eta || 0)}s${p.bytes ? ' · ' + fmtBytes(p.bytes) : ''}`;
        },
      });
      if (res.cancelled) toast('Export cancelled', true);
      else { toast(`Exported ${res.total} frames`); progTxt.textContent = `done — ${res.total} frames`; }
    } catch (e) {
      console.error(e);
      toast(e.name === 'AbortError' ? 'Export cancelled' : (e.message || 'Export failed'), true);
      progTxt.textContent = '';
    }
    exportState.running = false; upd();
  });
}

function fmtBytes(b) {
  if (b > 1e9) return (b / 1e9).toFixed(2) + ' GB';
  if (b > 1e6) return (b / 1e6).toFixed(1) + ' MB';
  return (b / 1e3).toFixed(0) + ' KB';
}

/* ───────── transport buttons + keys ───────── */

$('#btnPlay').addEventListener('click', toggle);
$('#btnStart').addEventListener('click', () => seek(0));
$('#btnEnd').addEventListener('click', () => seek(dur()));
$('#btnPrevF').addEventListener('click', () => stepFrame(-1));
$('#btnNextF').addEventListener('click', () => stepFrame(1));
$('#btnRetime').addEventListener('click', () => { retime(scene()); refresh(); toast('Re-timed'); });
$('#tlZoom').addEventListener('input', (e) => tl.setZoom(+e.target.value));
$('#previewQ').addEventListener('change', () => tick());
$('#chkChecker').addEventListener('change', (e) => $('#canvasBox').classList.toggle('checker', e.target.checked));
$('#chkSafe').addEventListener('change', (e) => $('#guides').classList.toggle('on', e.target.checked));

window.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if (e.code === 'Space') { e.preventDefault(); toggle(); }
  else if (e.code === 'ArrowLeft') { e.preventDefault(); stepFrame(e.shiftKey ? -10 : -1); }
  else if (e.code === 'ArrowRight') { e.preventDefault(); stepFrame(e.shiftKey ? 10 : 1); }
  else if (e.code === 'Home') { seek(0); }
  else if (e.code === 'End') { seek(dur()); }
  else if (e.code === 'Delete' || e.code === 'Backspace') {
    if (S.sel) { removeMessage(scene(), S.sel); S.sel = null; refresh(); }
    else if (S.selKf) { const tr = scene().tracks[S.selKf.key]; tr.splice(S.selKf.i, 1); S.selKf = null; refresh(); }
  }
});

window.addEventListener('resize', () => tick(true));

/* ───────── boot ───────── */

(async function boot() {
  $('#canvasBox').classList.add('checker');
  $('#projName').value = S.proj.name || 'Untitled chat';
  $('#scriptBox').value = SAMPLE_SCRIPT;
  await preloadAll(S.proj);
  refresh();
  seek(0);
})();

window.__studio = S;

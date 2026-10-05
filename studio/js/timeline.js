// ─────────────────────────────────────────────────────────────
// Timeline: draggable message bars + keyframe diamonds.
// Everything the user asked for lives here — when each message
// appears, how long the typing lasts, how long the three dots
// show, presence (online/offline) keyframes, camera keyframes.
// ─────────────────────────────────────────────────────────────

import { clamp, snapFrame, sortKfs, timecode, el } from './util.js';
import { DEFAULT_TIMING, invalidate, shiftFrom } from './project.js';

const ROW_H = 26;

export class Timeline {
  constructor(opts) {
    this.o = opts;                     // {getProject, getTime, onChange, onSeek, onSelectMsg, onSelectKf, isRipple, isSnap}
    this.names = document.getElementById('tlNames');
    this.scroll = document.getElementById('tlScroll');
    this.inner = document.getElementById('tlInner');
    this.tracks = document.getElementById('tlTracks');
    this.ruler = document.getElementById('tlRuler');
    this.ph = document.getElementById('playhead');
    this.pps = 110;
    this.selMsg = null;
    this.selKf = null;
    this.rows = [];
    this._bind();
  }

  setZoom(pps) { this.pps = pps; this.render(); }
  get duration() { return this.o.getDuration(); }
  get width() { return Math.max(400, this.duration * this.pps + 120); }

  t2x(t) { return t * this.pps; }
  x2t(x) { return x / this.pps; }

  snap(t) { return this.o.isSnap() ? snapFrame(t, this.o.getProject().out.fps) : +t.toFixed(3); }

  /* ── events ── */
  _bind() {
    const seekFromEvent = (e) => {
      const r = this.inner.getBoundingClientRect();
      const t = clamp(this.x2t(e.clientX - r.left), 0, this.duration);
      this.o.onSeek(this.snap(t));
    };
    this.ruler.addEventListener('pointerdown', (e) => {
      this.ruler.setPointerCapture(e.pointerId);
      this._scrubbing = true; seekFromEvent(e);
    });
    this.ruler.addEventListener('pointermove', (e) => { if (this._scrubbing) seekFromEvent(e); });
    this.ruler.addEventListener('pointerup', (e) => { this._scrubbing = false; try { this.ruler.releasePointerCapture(e.pointerId); } catch (_) {} });

    this.tracks.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.bar') || e.target.closest('.kf')) return;
      seekFromEvent(e);
    });

    this.scroll.addEventListener('scroll', () => { this.names.scrollTop = this.scroll.scrollTop; });

    this.tracks.addEventListener('dblclick', (e) => {
      const row = e.target.closest('.trow');
      if (!row) return;
      const ri = +row.dataset.i;
      const r = this.rows[ri];
      if (!r || r.type !== 'track') return;
      const rect = this.inner.getBoundingClientRect();
      const t = this.snap(clamp(this.x2t(e.clientX - rect.left), 0, this.duration));
      this.addKeyframe(r.key, t);
    });
  }

  addKeyframe(key, t) {
    const sc = this.o.getScene();
    const tr = (sc.tracks[key] = sc.tracks[key] || []);
    if (key === 'status') tr.push({ t, v: { mode: 'online' } });
    else if (key === 'camera') tr.push({ t, v: { x: 0.5, y: 0.5, scale: 1, rot: 0, opacity: 1 }, ease: 'inOut' });
    else tr.push({ t, v: 0, ease: 'inOut' });
    sortKfs(tr);
    invalidate(sc);
    this.o.onChange();
  }

  /* ── build ── */
  buildRows() {
    const sc = this.o.getScene();
    const rows = [
      { type: 'track', key: 'camera', label: '◆ Camera' },
      { type: 'track', key: 'status', label: '◆ Presence' },
      { type: 'track', key: 'scroll', label: '◆ Scroll offset' },
    ];
    sc.messages.forEach((m, i) => rows.push({ type: 'msg', idx: i, m }));
    this.rows = rows;
    return rows;
  }

  render() {
    const sc = this.o.getScene();
    const proj = this.o.getProject();
    if (!sc) return;
    const rows = this.buildRows();
    const W = this.width;

    this.inner.style.width = W + 'px';
    this.drawRuler(W, proj.out.fps);

    // names column
    this.names.innerHTML = '';
    this.names.appendChild(el('div', { class: 'nhead' }));
    rows.forEach((r, i) => {
      const n = el('div', { class: 'nrow' + (r.type === 'track' ? ' trk' : '') + (r.type === 'msg' && r.m.id === this.selMsg ? ' sel' : '') },
        r.type === 'track' ? r.label
          : el('span', { class: 'k' }, r.m.from === 'me' ? '▲' : r.m.from === 'them' ? '▼' : '•'),
        r.type === 'msg' ? el('span', {}, (r.m.text || (r.m.img ? '[image]' : '')).slice(0, 26) || '(empty)') : null,
      );
      if (r.type === 'msg') n.addEventListener('click', () => this.o.onSelectMsg(r.m.id));
      this.names.appendChild(n);
    });

    // tracks
    this.tracks.innerHTML = '';
    rows.forEach((r, i) => {
      const row = el('div', { class: 'trow' + (r.type === 'msg' && r.m.id === this.selMsg ? ' sel' : ''), 'data-i': i });
      if (r.type === 'track') this.renderTrack(row, r.key, sc);
      else this.renderBar(row, r, sc);
      this.tracks.appendChild(row);
    });

    this.updatePlayhead(this.o.getTime());
  }

  drawRuler(W, fps) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = this.ruler;
    c.width = W * dpr; c.height = 24 * dpr;
    c.style.width = W + 'px'; c.style.height = '24px';
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#12161c'; g.fillRect(0, 0, W, 24);
    g.strokeStyle = '#232b36'; g.beginPath(); g.moveTo(0, 23.5); g.lineTo(W, 23.5); g.stroke();

    // choose a nice step
    const targetPx = 72;
    const steps = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
    let step = steps.find((s) => s * this.pps >= targetPx) || 60;
    const sub = step / (step >= 1 ? 4 : 2);

    g.font = '10px Inter, sans-serif';
    g.textBaseline = 'middle';
    for (let t = 0; t <= this.duration + step; t += sub) {
      const x = Math.round(this.t2x(t)) + 0.5;
      const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
      g.strokeStyle = major ? '#48566a' : '#2a3442';
      g.beginPath(); g.moveTo(x, major ? 6 : 15); g.lineTo(x, 24); g.stroke();
      if (major) {
        g.fillStyle = '#7f8c9b';
        g.fillText(timecode(t, fps).slice(3), x + 3, 10);
      }
    }
  }

  renderTrack(row, key, sc) {
    const tr = sc.tracks[key] || [];
    tr.forEach((k, i) => {
      const d = el('div', {
        class: 'kf ' + (key === 'camera' ? 'cam' : key === 'scroll' ? 'scr' : '') +
          (this.selKf && this.selKf.key === key && this.selKf.i === i ? ' sel' : ''),
        title: `${key} @ ${k.t.toFixed(2)}s`,
      });
      d.style.left = (this.t2x(k.t) - 6) + 'px';
      this.dragKf(d, key, i);
      row.appendChild(d);
    });
  }

  dragKf(node, key, i) {
    node.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const sc = this.o.getScene();
      const tr = sc.tracks[key];
      this.selKf = { key, i };
      this.selMsg = null;
      this.o.onSelectKf({ key, i });
      const startX = e.clientX;
      const t0 = tr[i].t;
      node.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const t = clamp(this.snap(t0 + this.x2t(ev.clientX - startX)), 0, this.duration + 60);
        tr[i].t = t;
        node.style.left = (this.t2x(t) - 6) + 'px';
        invalidate(sc);
        this.o.onChange(true);
      };
      const up = () => {
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', up);
        sortKfs(tr); this.o.onChange(); this.render();
      };
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', up);
    });
  }

  barGeom(m, sc) {
    const S = { ...DEFAULT_TIMING, ...(sc.timing || {}) };
    const animDur = m.animDur ?? sc.ui.animDur ?? 0.32;
    let start = m.appear ?? 0;
    if (m.from === 'me' && m.showTypeInBar !== false && m.typeStart != null) start = m.typeStart;
    if (m.from === 'them' && m.showDots !== false && m.dotsStart != null) start = m.dotsStart;
    const end = (m.appear ?? 0) + animDur;
    return { start, end, appear: m.appear ?? 0, animDur, S };
  }

  renderBar(row, r, sc) {
    const m = r.m;
    const g = this.barGeom(m, sc);
    const x = this.t2x(g.start);
    const w = Math.max(10, this.t2x(g.end) - x);
    const preW = Math.max(0, this.t2x(g.appear) - x);
    const cls = m.from === 'me' ? 'me' : m.from === 'them' ? 'them' : 'sys';
    const bar = el('div', { class: `bar ${cls}` + (m.id === this.selMsg ? ' sel' : ''), title: this._tip(m, g) },
      preW > 2 ? el('div', { class: 'pre', style: { width: preW + 'px' } }) : null,
      el('div', { class: 'lbl' }, (m.text || (m.img ? '[image]' : '…')).slice(0, 40)),
      el('div', { class: 'hl' }), el('div', { class: 'hr' }),
    );
    bar.style.left = x + 'px';
    bar.style.width = w + 'px';
    this.dragBar(bar, r, sc);
    row.appendChild(bar);
  }

  _tip(m, g) {
    const L = [];
    L.push(`appears @ ${g.appear.toFixed(2)}s`);
    if (m.from === 'me' && m.typeStart != null) L.push(`typing ${m.typeStart.toFixed(2)}s → ${(m.typeStart + m.typeDur).toFixed(2)}s (${m.typeDur.toFixed(2)}s)`);
    if (m.from === 'them' && m.dotsStart != null) L.push(`three dots ${m.dotsStart.toFixed(2)}s for ${m.dotsDur.toFixed(2)}s`);
    L.push('drag = move · edges = resize · dbl-click track = add keyframe');
    return L.join('\n');
  }

  dragBar(node, r, sc) {
    node.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const m = r.m;
      this.selMsg = m.id; this.selKf = null;
      this.o.onSelectMsg(m.id);

      const mode = e.target.classList.contains('hl') ? 'left' : e.target.classList.contains('hr') ? 'right' : 'move';
      const g0 = this.barGeom(m, sc);
      const S = g0.S;
      const startX = e.clientX;
      const snapshot = {
        appear: m.appear, typeStart: m.typeStart, typeDur: m.typeDur,
        dotsStart: m.dotsStart, dotsDur: m.dotsDur, tDelivered: m.tDelivered, tRead: m.tRead,
      };
      node.setPointerCapture(e.pointerId);
      let moved = false;

      const move = (ev) => {
        const dRaw = this.x2t(ev.clientX - startX);
        if (Math.abs(ev.clientX - startX) < 2 && !moved) return;
        moved = true;
        const d = this.o.isSnap() ? snapFrame(dRaw, this.o.getProject().out.fps) : dRaw;

        if (mode === 'move') {
          const shift = Math.max(d, -g0.start);
          m.appear = +(snapshot.appear + shift).toFixed(3);
          if (snapshot.typeStart != null) m.typeStart = +(snapshot.typeStart + shift).toFixed(3);
          if (snapshot.dotsStart != null) m.dotsStart = +(snapshot.dotsStart + shift).toFixed(3);
          if (snapshot.tDelivered != null) m.tDelivered = +(snapshot.tDelivered + shift).toFixed(3);
          if (snapshot.tRead != null) m.tRead = +(snapshot.tRead + shift).toFixed(3);
          m.locked = true;
          if (this.o.isRipple()) {
            // shift everything after this message by the same amount
            for (let i = r.idx + 1; i < sc.messages.length; i++) {
              const n = sc.messages[i];
              const s = n._snap || (n._snap = { a: n.appear, ts: n.typeStart, ds: n.dotsStart, td: n.tDelivered, tr: n.tRead });
              n.appear = +(s.a + shift).toFixed(3);
              if (s.ts != null) n.typeStart = +(s.ts + shift).toFixed(3);
              if (s.ds != null) n.dotsStart = +(s.ds + shift).toFixed(3);
              if (s.td != null) n.tDelivered = +(s.td + shift).toFixed(3);
              if (s.tr != null) n.tRead = +(s.tr + shift).toFixed(3);
              n.locked = true;
            }
          }
        } else if (mode === 'left') {
          const ns = clamp(g0.start + d, 0, g0.appear - 0.05);
          if (m.from === 'me' && snapshot.typeStart != null) {
            m.typeStart = +ns.toFixed(3);
            m.typeDur = +Math.max(0.05, m.appear - m.typeStart - S.sendDelay).toFixed(3);
          } else if (m.from === 'them' && snapshot.dotsStart != null) {
            m.dotsStart = +ns.toFixed(3);
            m.dotsDur = +Math.max(0.05, m.appear - m.dotsStart - S.dotsToMsg).toFixed(3);
          } else {
            m.appear = +ns.toFixed(3);
          }
          m.locked = true; m.durLocked = true;
        } else {
          const na = Math.max(g0.start + 0.05, g0.appear + d);
          const delta = na - snapshot.appear;
          m.appear = +na.toFixed(3);
          if (m.from === 'me' && m.typeStart != null) m.typeDur = +Math.max(0.05, m.appear - m.typeStart - S.sendDelay).toFixed(3);
          if (m.from === 'them' && m.dotsStart != null) m.dotsDur = +Math.max(0.05, m.appear - m.dotsStart - S.dotsToMsg).toFixed(3);
          if (snapshot.tDelivered != null) m.tDelivered = +(snapshot.tDelivered + delta).toFixed(3);
          if (snapshot.tRead != null) m.tRead = +(snapshot.tRead + delta).toFixed(3);
          m.locked = true; m.durLocked = true;
        }

        const gg = this.barGeom(m, sc);
        node.style.left = this.t2x(gg.start) + 'px';
        node.style.width = Math.max(10, this.t2x(gg.end) - this.t2x(gg.start)) + 'px';
        const pre = node.querySelector('.pre');
        if (pre) pre.style.width = Math.max(0, this.t2x(gg.appear) - this.t2x(gg.start)) + 'px';
        invalidate(sc);
        this.o.onChange(true);
      };

      const up = () => {
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', up);
        sc.messages.forEach((n) => delete n._snap);
        this.o.onChange();
        this.render();
      };
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', up);
    });
  }

  updatePlayhead(t) {
    this.ph.style.transform = `translateX(${this.t2x(t)}px)`;
  }

  ensureVisible(t) {
    const x = this.t2x(t);
    const sl = this.scroll.scrollLeft, w = this.scroll.clientWidth;
    if (x < sl + 40 || x > sl + w - 40) this.scroll.scrollLeft = Math.max(0, x - w * 0.4);
  }
}

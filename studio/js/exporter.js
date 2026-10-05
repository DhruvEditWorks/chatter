// ─────────────────────────────────────────────────────────────
// Frame-exact exporter.
//
// Renders every frame at t = frame / fps into an offscreen canvas
// at full output resolution and writes a numbered PNG (RGBA, alpha
// preserved). Two sinks:
//   • "Folder"  → File System Access API, streams straight to disk
//                 (no memory ceiling, best for long shots)
//   • "ZIP"     → single stored-zip download (works everywhere)
//
// DaVinci Resolve: drop the folder into the Media Pool, it is
// auto-detected as an image sequence. Set the clip's frame rate to
// the project fps in Clip Attributes if it was interpreted wrong.
// ─────────────────────────────────────────────────────────────

import { renderFrame } from './renderer.js';
import { preloadAll } from './assets.js';
import { ZipWriter } from './zip.js';
import { download } from './util.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((res) => canvas.toBlob(res, type, quality));
}

const pad = (n, w) => String(n).padStart(w, '0');

export async function exportStillPNG(project, t, filename) {
  await preloadAll(project);
  const c = makeCanvas(project.out.w, project.out.h);
  const ctx = c.getContext('2d', { alpha: true });
  ctx.imageSmoothingQuality = 'high';
  renderFrame(ctx, project, t);
  const blob = await canvasToBlob(c);
  download(blob, filename || `${slug(project.name)}_still.png`);
}

export function slug(s) {
  return String(s || 'chatter').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48) || 'chatter';
}

export function frameCount(project, duration) {
  return Math.max(1, Math.round(duration * project.out.fps));
}

/**
 * @param {object} opts {duration, start, sink:'folder'|'zip', onProgress, signal, prefix, padding, jpeg}
 */
export async function exportSequence(project, opts) {
  const {
    duration, start = 0, sink = 'zip', onProgress = () => {},
    prefix = slug(project.name), padding = 5, jpeg = false, quality = 0.95,
  } = opts;

  await preloadAll(project);

  const fps = project.out.fps;
  const total = Math.max(1, Math.round(duration * fps));
  const c = makeCanvas(project.out.w, project.out.h);
  const ctx = c.getContext('2d', { alpha: !jpeg });
  ctx.imageSmoothingQuality = 'high';

  const ext = jpeg ? 'jpg' : 'png';
  const mime = jpeg ? 'image/jpeg' : 'image/png';

  let dirHandle = null;
  let zip = null;
  if (sink === 'folder') {
    dirHandle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'chatter-seq' });
    const sub = await dirHandle.getDirectoryHandle(`${prefix}_${project.out.w}x${project.out.h}_${fps}fps`, { create: true });
    dirHandle = sub;
  } else {
    zip = new ZipWriter();
  }

  const state = { cancelled: false };
  opts.cancelRef && (opts.cancelRef.cancel = () => { state.cancelled = true; });

  const t0 = performance.now();
  for (let f = 0; f < total; f++) {
    if (state.cancelled) break;
    const t = start + f / fps;
    renderFrame(ctx, project, t);
    const blob = await canvasToBlob(c, mime, jpeg ? quality : undefined);
    const name = `${prefix}.${pad(f, padding)}.${ext}`;
    if (dirHandle) {
      const fh = await dirHandle.getFileHandle(name, { create: true });
      const ws = await fh.createWritable();
      await ws.write(blob);
      await ws.close();
    } else {
      zip.add(name, new Uint8Array(await blob.arrayBuffer()));
    }
    if (f % 2 === 0 || f === total - 1) {
      const elapsed = (performance.now() - t0) / 1000;
      const eta = f > 0 ? (elapsed / (f + 1)) * (total - f - 1) : 0;
      onProgress({ frame: f + 1, total, pct: ((f + 1) / total) * 100, eta, bytes: zip ? zip.bytes : 0 });
      await new Promise((r) => setTimeout(r, 0)); // keep the UI alive
    }
  }

  if (state.cancelled) {
    onProgress({ frame: 0, total, pct: 0, cancelled: true });
    return { cancelled: true };
  }

  if (zip) {
    zip.add(`${prefix}_README.txt`, new TextEncoder().encode(readme(project, total, ext, prefix, padding)));
    const blob = zip.close();
    download(blob, `${prefix}_${project.out.w}x${project.out.h}_${fps}fps_${ext}seq.zip`);
    return { zipped: true, total };
  }

  // drop the readme next to the frames too
  try {
    const fh = await dirHandle.getFileHandle(`${prefix}_README.txt`, { create: true });
    const ws = await fh.createWritable();
    await ws.write(new Blob([readme(project, total, ext, prefix, padding)], { type: 'text/plain' }));
    await ws.close();
  } catch (e) { /* ignore */ }

  return { folder: true, total };
}

function readme(project, total, ext, prefix, padding) {
  const { w, h, fps } = project.out;
  return `CHATTER STUDIO — image sequence
================================
Frames      : ${total}  (${prefix}.${'0'.repeat(padding)}.${ext} → ${prefix}.${String(total - 1).padStart(padding, '0')}.${ext})
Resolution  : ${w} x ${h}   (${(w / h).toFixed(3)}:1)
Frame rate  : ${fps} fps
Alpha       : ${ext === 'png' ? 'YES — straight (unpremultiplied) RGBA' : 'no (JPEG)'}
Duration    : ${(total / fps).toFixed(2)} s  =  ${total} frames @ ${fps}fps

DAVINCI RESOLVE — IMPORT
------------------------
1. Project Settings ▸ Master Settings
     Timeline resolution : ${w} x ${h}   (Custom)
     Timeline frame rate : ${fps}        (set this BEFORE importing anything)
2. Drag this whole FOLDER into the Media Pool.
   Resolve collapses the numbered files into one image-sequence clip.
   (If it shows up as ${total} separate stills: Preferences ▸ User ▸ Editing ▸
    "Frame interpolation"… no — check Media Storage ▸ "Auto-detect image
    sequences" is ON, then re-import.)
3. If the clip's fps is wrong: right-click clip ▸ Clip Attributes ▸ Video ▸
   Frame Rate = ${fps}.
4. Alpha: right-click clip ▸ Clip Attributes ▸ Video ▸ Alpha Mode = Straight.
   Drop it on a video track ABOVE your footage — it composites directly.
5. No render-cache weirdness: Playback ▸ Render Cache ▸ Smart is fine.

FUSION / EDIT PAGE
------------------
The sequence behaves like any other clip: resize/position it with the
Inspector (Transform) or inside Fusion with a Transform node. Because the
frames are vector-rendered at ${w}px wide, scaling DOWN stays crisp.
`;
}

/* ───────── optional WebM (alpha) via MediaRecorder ───────── */

export async function exportWebM(project, opts) {
  const { duration, onProgress = () => {}, bitrate = 40_000_000 } = opts;
  await preloadAll(project);
  const fps = project.out.fps;
  const total = Math.round(duration * fps);
  const c = makeCanvas(project.out.w, project.out.h);
  const ctx = c.getContext('2d', { alpha: true });

  const mimeCandidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('WebM recording not supported in this browser.');

  const stream = c.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((res) => { rec.onstop = res; });
  rec.start();

  for (let f = 0; f < total; f++) {
    renderFrame(ctx, project, f / fps);
    if (track.requestFrame) track.requestFrame();
    if (f % 4 === 0) { onProgress({ frame: f + 1, total, pct: ((f + 1) / total) * 100 }); await new Promise((r) => setTimeout(r, 0)); }
  }
  rec.stop();
  await done;
  download(new Blob(chunks, { type: mime }), `${slug(project.name)}_${project.out.w}x${project.out.h}_${fps}fps.webm`);
  return { total };
}

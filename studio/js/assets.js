// ─────────────────────────────────────────────────────────────
// Image cache. Everything the renderer draws must be preloaded
// before export so every frame is deterministic.
// ─────────────────────────────────────────────────────────────

const cache = new Map(); // resolved src → {img, ok, w, h, promise}

/** Script paths like "avatars/x.jpg" are relative to the repo root, not /studio/. */
export function resolveSrc(src) {
  if (!src) return null;
  const s = String(src).trim();
  if (/^(data:|blob:|https?:\/\/|\/)/i.test(s)) return s;
  return '../' + s.replace(/^\.\//, '');
}

export function getImage(src) {
  const key = resolveSrc(src);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);
  const rec = { img: new Image(), ok: false, w: 0, h: 0, src: key };
  rec.img.crossOrigin = 'anonymous';
  rec.promise = new Promise((res) => {
    rec.img.onload = () => { rec.ok = true; rec.w = rec.img.naturalWidth; rec.h = rec.img.naturalHeight; res(rec); };
    rec.img.onerror = () => { rec.ok = false; res(rec); };
  });
  rec.img.src = key;
  cache.set(key, rec);
  return rec;
}

export function collectSources(project) {
  const out = new Set();
  for (const sc of project.scenes) {
    if (sc.contactAvatar) out.add(sc.contactAvatar);
    if (sc.meAvatar) out.add(sc.meAvatar);
    if (sc.wallpaper) out.add(sc.wallpaper);
    for (const m of sc.messages) if (m.img) out.add(m.img);
  }
  return Array.from(out);
}

export async function preloadAll(project) {
  const recs = collectSources(project).map(getImage).filter(Boolean);
  await Promise.all(recs.map((r) => r.promise));
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  return recs;
}

export function clearCache() { cache.clear(); }

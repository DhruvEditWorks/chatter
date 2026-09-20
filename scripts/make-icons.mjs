/*
 * Generates every launcher / PWA icon for Chatter from Favicon/Chatter.svg.
 *
 *   node scripts/make-icons.mjs
 *
 * Needs `sharp` (devDependency, only used by this script):
 *   npm i -D sharp
 *
 * The generated PNGs are committed, so a normal `npm run apk:debug` never needs
 * sharp at all.
 */
import sharp from "sharp";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RES = join(root, "android/app/src/main/res");

const GRADIENT = `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#ff6b57"/><stop offset="1" stop-color="#ff8f5e"/>
</linearGradient>`;

const BUBBLE = `<path d="M20 18h24a7 7 0 0 1 7 7v11a7 7 0 0 1-7 7H31.5L23 50v-7h-3a7 7 0 0 1-7-7V25a7 7 0 0 1 7-7z" fill="#fff"/>
<circle cx="25.5" cy="31.5" r="2.7" fill="#ff6b57"/>
<circle cx="33.5" cy="31.5" r="2.7" fill="#ff7d58"/>
<circle cx="41.5" cy="31.5" r="2.7" fill="#ff8f5e"/>`;

/** Full 64x64 logo: coral rounded square + white bubble. */
function logoSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>${GRADIENT}</defs>
  <rect x="4" y="4" width="56" height="56" rx="17" fill="url(#g)"/>
  ${BUBBLE}
</svg>`;
}

/* The bubble art spans x 13..51, y 18..50 inside the 64x64 viewBox,
 * so its optical centre is (32, 34). `centered()` shrinks it around that
 * point and re-centres it on (32, 32). */
function centered(scale) {
  const tx = 32 - 32 * scale;
  const ty = 32 - 34 * scale;
  return `<g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${scale})">${BUBBLE}</g>`;
}

/** Edge-to-edge coral with the bubble pulled into the maskable safe zone. */
function maskableSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>${GRADIENT}</defs>
  <rect width="64" height="64" fill="url(#g)"/>
  ${centered(0.6)}
</svg>`;
}

/** Transparent 108dp adaptive foreground: white bubble only. */
function foregroundSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  ${centered(0.72)}
</svg>`;
}

async function png(svg, size) {
  return sharp(Buffer.from(svg), { density: Math.round((size / 64) * 96) })
    .resize(size, size)
    .png()
    .toBuffer();
}

async function clipCircle(svg, size) {
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
  );
  return sharp(await png(svg, size))
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

const out = [];
async function write(rel, buf) {
  const abs = join(root, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, buf);
  out.push(rel);
}

/* ---------------------------------------------------------- Android launcher */
const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

for (const [density, size] of Object.entries(LEGACY)) {
  await write(`android/app/src/main/res/mipmap-${density}/ic_launcher.png`, await png(logoSvg(), size));
  await write(`android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`, await clipCircle(logoSvg(), size));
}
for (const [density, size] of Object.entries(FOREGROUND)) {
  await write(`android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`, await png(foregroundSvg(), size));
}

/* Drop the placeholder vector foreground so only the generated PNG is used. */
await rm(join(RES, "drawable-v24/ic_launcher_foreground.xml"), { force: true });

/* --------------------------------------------------------------- PWA icons */
await write("icons/icon-192.png", await png(logoSvg(), 192));
await write("icons/icon-512.png", await png(logoSvg(), 512));
await write("icons/icon-maskable-512.png", await png(maskableSvg(), 512));
await write("icons/apple-touch-icon.png", await png(logoSvg(), 180));

console.log(`generated ${out.length} icons`);
for (const f of out) console.log("  " + f);

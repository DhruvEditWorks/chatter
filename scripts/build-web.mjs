/*
 * Builds the deployable web bundle into dist/ (also used as Capacitor webDir).
 *
 *   node scripts/build-web.mjs
 *
 * - Copies index.html + all static assets.
 * - Strips the design-arena telemetry / rrweb recorder scripts (they only make
 *   sense inside the arena preview and should not ship in the APK).
 */
import { cp, mkdir, readFile, rm, writeFile, copyFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

/** Remove <script data-arena-...>...</script> blocks (non-greedy, multiline). */
export function stripArena(html) {
  return html
    .replace(/<script\b[^>]*data-arena-[a-z-]+="[^"]*"[^>]*>[\s\S]*?<\/script>/g, "")
    .replace(/<script\b[^>]*data-arena-[a-z-]+[^>]*>[\s\S]*?<\/script>/g, "");
}

async function copyDir(rel) {
  const src = join(root, rel);
  const dst = join(dist, rel);
  if (existsSync(src)) await cp(src, dst, { recursive: true });
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

let html = await readFile(join(root, "index.html"), "utf8");
html = stripArena(html);
await writeFile(join(dist, "index.html"), html);

for (const file of ["chatter-alarms.js", "sw.js", "manifest.webmanifest", "contacts.json", "upcoming_replies.txt"]) {
  if (existsSync(join(root, file))) await copyFile(join(root, file), join(dist, file));
}

for (const dir of ["avatars", "Favicon", "icons"]) await copyDir(dir);

// sanity: report sizes
const outHtml = await readFile(join(dist, "index.html"), "utf8");
console.log("dist ready");
console.log("  source index.html bytes :", (await stat(join(root, "index.html"))).size);
console.log("  dist index.html bytes   :", Buffer.byteLength(outHtml));
console.log("  arena scripts remaining :", (outHtml.match(/data-arena-/g) || []).length);

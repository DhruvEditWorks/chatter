/*
 * Smoke test for the scheduled-message + native-notification pipeline.
 *
 *   node scripts/smoke-native-scheduler.mjs
 *
 * Boots the BUILT app (dist/index.html) in jsdom, relabeling the bundled IIFE
 * as a classic script (jsdom can't run type=module), and installs a faithful
 * in-memory clone of the Java `ScheduleStore` as the Capacitor plugin.
 *
 * It then verifies the REAL shipped web code:
 *   - boots without throwing,
 *   - a due scheduled message is fired through the native bridge (fireAndDrain),
 *   - the message is inserted into chat state (offline-delivery path),
 *   - the scheduled queue is drained (no double fire).
 *
 * Requires: npm i -D jsdom
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "dist", "index.html"), "utf8")
  .replace(/<script type="module" crossorigin>/g, "<script>")
  .replace(/import\.meta\.url/g, '"https://localhost/"');
const facadeSrc = readFileSync(join(root, "chatter-alarms.js"), "utf8");

/* Mirrors the semantics of the Java ScheduleStore (fire-once + delivered). */
function makeNativePlugin() {
  const fired = new Set();
  const pending = new Map();
  let delivered = [];
  const calls = { schedule: 0, cancel: 0, fire: 0, drain: 0 };
  return {
    calls,
    _pending: pending,
    schedule({ entry }) { calls.schedule++; pending.set(entry.id, entry); return {}; },
    sync({ entries }) { pending.clear(); for (const e of entries) pending.set(e.id, e); return {}; },
    cancel({ id }) { calls.cancel++; pending.delete(id); delivered = delivered.filter((d) => d.id !== id); fired.delete(id); return {}; },
    markApplied({ id }) { pending.delete(id); delivered = delivered.filter((d) => d.id !== id); return {}; },
    fireAndDrain({ entries }) {
      calls.fire++;
      for (const e of entries) if (!fired.has(e.id)) { fired.add(e.id); delivered.push(e); }
      const out = delivered; delivered = []; calls.drain++;
      return { entries: out };
    },
    takeDelivered() { const out = delivered; delivered = []; calls.drain++; return { entries: out }; },
    askPermission() { return { granted: true }; },
    status() { return { native: true, notifications: true, exactAlarms: true }; },
  };
}

function shims(w) {
  w.matchMedia = w.matchMedia || ((q) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }));
  w.ResizeObserver = w.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  w.IntersectionObserver = w.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  const AC = class { constructor() {} createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} } }; } get destination() { return {}; } get currentTime() { return 0; } close() {} };
  w.AudioContext = w.AudioContext || AC;
  w.webkitAudioContext = w.AudioContext;
  try { Object.defineProperty(w.navigator, "serviceWorker", { value: undefined }); } catch (e) {}
}

// Full contact-shaped users (same shape the renderer expects) from the repo's
// own contacts.json so the real UI render path doesn't choke on thin data.
const contacts = JSON.parse(readFileSync(join(root, "contacts.json"), "utf8"));
const me = "u-reyansh";
const partnerId = "u-riya";
const seed = {
  version: 1,
  currentUserId: me,
  users: contacts,
  messages: [],
  conversations: {},
  posts: [],
  settings: {},
  drive: {},
  presence: {},
  typing: {},
  gifRecents: [],
  savedScripts: [],
  upcomingReplies: [],
  scheduledMessages: [
    { id: "sch-1", partnerId, sendAs: "partner", text: "PING-FROM-NATIVE", fireAt: Date.now() - 5000, createdAt: Date.now() - 6000 },
  ],
};

const native = makeNativePlugin();
const pageErrors = [];

const dom = new JSDOM(html, {
  url: "https://localhost/",
  runScripts: "dangerously",
  resources: "usable",
  pretendToBeVisual: true,
  beforeParse(w) {
    shims(w);
    w.localStorage.setItem("chatter.state.v1", JSON.stringify(seed));
    w.addEventListener("error", (e) => pageErrors.push(String(e.message)));
    w.Capacitor = { isNativePlatform: () => true, Plugins: { ChatterScheduler: native } };
    w.eval(facadeSrc);
  },
});

setTimeout(async () => {
  const w = dom.window;
  const fatal = pageErrors.filter((e) => !/Could not load|jsdom|not implemented|AudioContext/i.test(e));

  const after = JSON.parse(w.localStorage.getItem("chatter.state.v1"));
  const msg = after.messages.find((m) => m.text === "PING-FROM-NATIVE");

  try {
    assert.equal(fatal.length, 0, "unexpected runtime errors: " + fatal.join(" | "));
    assert.equal(w.ChatterAlarms.platform(), "android", "bridge reports android");
    assert.ok(native.calls.fire >= 1, "native fireAndDrain was used");
    assert.ok(msg, "delivered message inserted into chat state");
    assert.equal(msg.senderId, partnerId, "attributed to partner");
    assert.equal(after.scheduledMessages.find((s) => s.id === "sch-1"), undefined, "scheduled item consumed");

    console.log("SMOKE OK");
    console.log("  platform          :", w.ChatterAlarms.platform());
    console.log("  native fire calls :", native.calls.fire);
    console.log("  delivered message :", msg.text, "from", msg.senderId);
    process.exit(0);
  } catch (err) {
    console.error("SMOKE FAIL:", err.message);
    console.error("  fatal page errors:", fatal);
    console.error("  native calls     :", JSON.stringify(native.calls));
    process.exit(1);
  }
}, 2500);

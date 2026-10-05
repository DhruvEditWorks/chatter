# Chatter Studio

On-screen chat animator for short films. Feed it a script, get a **frame-exact
24 fps 2.39:1 PNG sequence with alpha** that drops straight into DaVinci Resolve.

Open `studio/index.html` (or `https://<your-deploy>/studio/`). No build step, no
dependencies, works offline.

---

## 1. Can this be a DaVinci Resolve plugin?

Short answer: **yes, but only one of the plugin types is actually worth it.**

| Resolve extension type | Works? | Verdict |
|---|---|---|
| **Workflow Integration Plugin** (HTML/JS panel inside Resolve, talks to the scripting API) | ✅ — **Resolve _Studio_ only** | This exact app can be wrapped as a Resolve panel. Phase 2, see below. |
| Fusion Macro / Edit-page template (`.setting`) | ⚠️ | Native, keyframable in the Inspector, but a chat UI needs one node chain per message. Unusable past ~8 messages, no text wrapping, no emoji. |
| Fuse (`.fuse`, Lua) | ⚠️ | You would have to re-implement text layout, wrapping, emoji and image decoding in Lua. Months of work for a worse result. |
| DCTL | ❌ | Colour transforms only. Cannot draw a UI. |
| OFX | ⚠️ | C++ plugin, needs per-OS builds + signing. Massive overkill. |

**So the shipping plan is:** this standalone tool renders the frames, Resolve
just imports them. Export can never break, because a numbered PNG sequence is
the single most boring, most compatible thing you can hand to an NLE.

**Phase 2 (Resolve Studio panel)** reuses 100% of `studio/js/` and adds:

```
~/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Workflow Integration Plugins/
└── chatter/
    ├── manifest.xml          ← plugin id, name, entry point
    ├── main.js               ← Electron-ish host: creates the window
    └── (this folder)         ← the UI, unchanged
```

The panel calls `WorkflowIntegration.GetResolve()` → `MediaStorage.AddItemsToMediaPool(path)`
→ `Timeline.AppendToTimeline(...)` so the rendered sequence lands on the timeline
automatically. Everything else — script parsing, keyframes, renderer, exporter —
is already written and already tested.

> Note: Workflow Integration Plugins are a **Resolve Studio** feature. On free
> Resolve, keep using the folder-import route; it is 2 drag-and-drops.

---

## 2. Feeding it a script

Paste into the **Script** tab, press **Build timeline from script**. All of these
work, mixed freely in one file.

### Your existing trigger format (`upcoming_replies.txt`) — supported as-is

```
Contact ~ "Amaira", Trigger ~ "Good Night", Reply ~ "Good Night sweet dreams"
Contact ~ "Aarav",  Trigger ~ "reached",    Reply ~ "Coming down to the lobby in 2 mins."
```

* `Trigger` becomes **your outgoing message** (typed in the input bar)
* `Reply` becomes **their incoming message** (preceded by the three dots)
* each `Contact` becomes its own **scene** — switch scenes above the preview
* a `Reply` that is an image path/URL becomes an image message; anything after
  the path becomes the caption:
  `Reply ~ "chat_imgs/pic.png Here is the picture from today!"`

### Screenplay format

```
Amaira: okay so today was SO chaotic 😭
Me: lol tell me everything
> outgoing shorthand
< incoming shorthand
```

### Directives

| Directive | Effect |
|---|---|
| `@contact "Amaira"` | start / switch to a chat |
| `@me "Reyansh"` | your display name |
| `@avatar avatars/amaira.jpg` | their profile picture (or upload one in the Scene tab) |
| `@myavatar path` | your profile picture |
| `@wallpaper chat_imgs/x.png` | chat wallpaper |
| `@clock "9:41 PM"` | first bubble timestamp (later ones auto-increment) |
| `@date "Today"` | centred date chip |
| `@system "Messages are end-to-end encrypted"` | grey system chip |
| `@online` / `@offline` | **drops a presence keyframe** at that point in the script |
| `@lastseen "2 hours ago"` | header shows `last seen 2 hours ago` |
| `@typing "typing…"` | force the typing label on |
| `@wait 1.5` | insert a 1.5 s pause |

### Per-line timing overrides

```
Me: hey || typing=2.4 gap=0.8 anim=slide
Amaira: hi || dots=1.6 react=❤️
Amaira: nope || nodots
Me: brb || notype
Amaira: [img chat_imgs/pic.png] look at this
```

| Key | Meaning |
|---|---|
| `typing=2.4` | how long **you** type this in the input bar |
| `dots=1.6` | how long **their** three-dot bubble shows |
| `pre=1.0` / `gap=0.8` | pause before / after this message |
| `anim=pop\|fade\|slide\|rise\|bounce\|none` | appear animation |
| `nodots` | this reply appears with no typing indicator |
| `notype` | this outgoing message is not typed in the bar, it just appears |
| `react=❤️` | reaction pill on the bubble |

---

## 3. Controls

**Timeline (bottom)** — one row per message plus three keyframe tracks.

* **drag a bar** → move the whole message (typing + appear + ticks together)
* **drag its left edge** → change when the typing / three-dots start (duration follows)
* **drag its right edge** → change exactly when the bubble lands
* **`ripple`** checkbox → everything after moves with it
* **`snap to frames`** → every edit lands on a whole 24 fps frame
* **double-click a keyframe track** → add a keyframe there
* dragging anything **locks** that message, so `Auto re-time all` leaves it alone

**Keyframe tracks**

| Track | What it does |
|---|---|
| ◆ Camera | pan / zoom / rotate / fade the whole phone inside the 2.39 frame |
| ◆ Presence | online · offline · `last seen …` · custom header text |
| ◆ Scroll offset | manual scroll on top of the automatic bottom-pinned scroll |

**Message inspector (right)** — sender, text, attachment, bubble clock label,
reaction, appear animation + duration, typing start / duration, dots start /
duration, exact appear time, delivered-tick time, read-tick (blue) time,
pause before / after, and the two locks.

**Scene tab** — contact name (plain field, **not** keyframed, as requested),
profile pictures (upload or path), wallpaper, status-bar clock, battery %,
typing label, header-typing on/off, three-dot bubble on/off, default appear
animation, scroll glide, and all three keyframe lists.

**Look tab** — WhatsApp dark/light, iMessage dark/light, Instagram dark, plus
every colour, radius, padding, font size and bar height exposed as a live field
so the UI can be pixel-matched to a reference screenshot.

**Timing tab** — the auto-layout engine: typing speed in characters/second,
min/max typing time, their think time, gaps, tick delays, end hold.
`Auto re-time all` rebuilds everything except locked messages.

Keyboard: `Space` play/pause · `←/→` step a frame (`Shift` = 10) · `Home`/`End` ·
`Delete` removes the selected message or keyframe.

---

## 4. Export → DaVinci Resolve

**Export ▸** gives you:

* **PNG sequence, RGBA with straight alpha** — written either straight into a
  folder on disk (Chrome/Edge, no size limit, recommended) or as one `.zip`
* **JPEG sequence** if you don't need alpha
* **current frame PNG** for stills
* **WebM (VP9 alpha)** if you want a single file

Resolution presets: 2048×858, 1920×804, 2560×1072, 3840×1608, 4096×1716 (all
2.39:1) plus UHD / HD / 9:16, or type any custom size. Frame rate 23.976 → 60,
default **24**.

### Import steps

1. **Project Settings ▸ Master Settings** — timeline resolution = your export
   size (Custom), timeline frame rate = **24**. Set this *before* importing.
2. Drag the **folder** into the Media Pool. Resolve collapses the numbered PNGs
   into one image-sequence clip.
   *If it imports as separate stills:* Preferences ▸ System ▸ Media Storage ▸
   enable auto-detect image sequences, then re-import.
3. Wrong fps on the clip? Right-click ▸ **Clip Attributes ▸ Video ▸ Frame Rate = 24**.
4. **Clip Attributes ▸ Video ▸ Alpha Mode = Straight**, then drop it on a track
   above your footage — it composites with no extra node.
5. Delivering a master with alpha: QuickTime ▸ **ProRes 4444** (or DNxHR 444).

A `README.txt` with these exact numbers is written next to every export.

### Why export can't break

* Every frame is rendered from `t = frame / fps` — no `Date.now()`, no
  `Math.random()` at render time (the typing rhythm is a seeded PRNG keyed to the
  message id). Re-render any frame, any day, get identical pixels.
* Nothing is captured from the screen, so the preview window size, your monitor,
  and browser zoom have zero effect on the output.
* PNG is lossless and carries real per-pixel alpha. No chroma key needed.

---

## 5. Project files

**Save .chatproj** writes a single JSON with every message, keyframe, theme tweak
and embedded uploaded image. **Open** restores it exactly. The project also
autosaves to the browser's local storage after every edit.

---

## 6. Layout of the code

```
studio/
├── index.html          UI shell
├── css/app.css
└── js/
    ├── app.js          wiring, panels, export dialog
    ├── timeline.js     draggable bars + keyframe diamonds
    ├── renderer.js     deterministic canvas renderer  ← the core
    ├── layout.js       text wrapping / bubble measurement (cached)
    ├── theme.js        theme presets + the editable field list
    ├── parser.js       script → messages
    ├── project.js      data model + auto-timing engine
    ├── exporter.js     PNG sequence / WebM / still
    ├── assets.js       image cache + preloading
    ├── zip.js          dependency-free stored-ZIP writer
    └── util.js         easing, keyframe evaluation, timecode
```

All geometry is authored in a 390 pt design space and scaled to the device
resolution at draw time, so themes are resolution independent and text stays
crisp at 4K.

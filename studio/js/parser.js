// ─────────────────────────────────────────────────────────────
// Script parser
//
// Supported, all mixable in one file:
//
//   1) Chatter trigger format (same as upcoming_replies.txt):
//      Contact ~ "Amaira", Trigger ~ "Good Night", Reply ~ "Good Night sweet dreams"
//      → outgoing "Good Night", then incoming "Good Night sweet dreams"
//      Reply may be an image path/URL, optionally followed by a caption.
//
//   2) Simple screenplay format:
//      Me: hey, you up?
//      Amaira: haan bol
//      > outgoing shorthand
//      < incoming shorthand
//
//   3) Directives (line starts with @):
//      @contact "Amaira"        @avatar avatars/amaira.jpg
//      @me "Reyansh"            @wallpaper chat_imgs/x.png
//      @online                  @offline        @lastseen "2 hours ago"
//      @typing "typing…"        @date "Today"   @system "Messages are encrypted"
//      @wait 1.5                @clock "9:41 PM"
//
//   4) Per-line timing overrides, appended after `||`:
//      Me: hey || typing=2.4 gap=0.8 anim=slide
//      Amaira: hi || dots=1.6 gap=0.4 nodots
//
//   5) Images on any line:
//      Amaira: [img chat_imgs/pic.png] look at this
// ─────────────────────────────────────────────────────────────

import { uid, looksLikeImage } from './util.js';

const Q = `["'“”‘’]`;

function stripQuotes(s) {
  const t = String(s || '').trim();
  return t.replace(new RegExp(`^${Q}|${Q}$`, 'g'), '').trim();
}

function parseOpts(raw) {
  const o = {};
  if (!raw) return o;
  for (const tok of raw.trim().split(/\s+/)) {
    if (!tok) continue;
    const m = /^([a-zA-Z]+)\s*=\s*(.+)$/.exec(tok);
    if (m) {
      const k = m[1].toLowerCase();
      const v = m[2];
      o[k] = isNaN(parseFloat(v)) ? stripQuotes(v) : parseFloat(v);
    } else {
      o[tok.toLowerCase()] = true;
    }
  }
  return o;
}

function splitImage(text) {
  let t = String(text || '').trim();
  // explicit [img path] caption
  const tag = /^\[img\s+([^\]]+)\]\s*(.*)$/i.exec(t);
  if (tag) return { img: tag[1].trim(), text: tag[2].trim() };
  if (looksLikeImage(t)) {
    const parts = t.split(/\s+/);
    const first = parts.shift();
    return { img: first, text: parts.join(' ').trim() };
  }
  return { img: null, text: t };
}

function mkMsg(from, raw, opts = {}) {
  const { img, text } = splitImage(raw);
  return {
    id: uid('m'),
    from,                               // 'me' | 'them'
    type: img ? 'image' : 'text',
    text,
    img,
    anim: opts.anim || null,            // null → use scene default
    // timings are filled by retime()
    typeStart: null, typeDur: null, dotsStart: null, dotsDur: null, appear: null,
    hold: { typeDur: opts.typing != null, dotsDur: opts.dots != null },
    optTypeDur: opts.typing != null ? +opts.typing : null,
    optDotsDur: opts.dots != null ? +opts.dots : null,
    gapAfter: opts.gap != null ? +opts.gap : null,
    gapBefore: opts.pre != null ? +opts.pre : null,
    showDots: opts.nodots ? false : true,
    showTypeInBar: opts.notype ? false : true,
    locked: false,
    time: null,                          // bubble clock label (auto if null)
    reaction: opts.react ? { emoji: String(opts.react), t: null } : null,
  };
}

function mkSystem(text, opts = {}) {
  return { id: uid('s'), from: 'system', type: 'system', text, appear: null,
    gapAfter: opts.gap != null ? +opts.gap : 0.2, gapBefore: opts.pre != null ? +opts.pre : 0,
    anim: 'fade', locked: false };
}

/**
 * Parse a script into scenes (one per contact).
 * @returns {{scenes: Array, warnings: string[]}}
 */
export function parseScript(src, defaults = {}) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const warnings = [];
  const scenes = new Map(); // name → scene
  let current = null;
  let meName = defaults.meName || 'Me';

  function scene(name) {
    const key = name || 'Chat';
    if (!scenes.has(key)) {
      scenes.set(key, {
        id: uid('sc'),
        contactName: key,
        contactAvatar: null,
        meName,
        meAvatar: null,
        wallpaper: null,
        clock: '9:41 PM',
        messages: [],
        pendingStatus: [],   // [{afterIndex, v}]
        pendingWait: 0,
      });
    }
    return scenes.get(key);
  }

  function push(msg) {
    const sc = current || scene(defaults.contactName || 'Chat');
    if (sc.pendingWait) { msg.gapBefore = (msg.gapBefore || 0) + sc.pendingWait; sc.pendingWait = 0; }
    sc.messages.push(msg);
    return msg;
  }

  function addStatus(v) {
    const sc = current || scene(defaults.contactName || 'Chat');
    sc.pendingStatus.push({ afterIndex: sc.messages.length - 1, v });
  }

  for (let li = 0; li < lines.length; li++) {
    let line = lines[li];
    if (!line.trim()) continue;
    if (/^\s*(#|\/\/)/.test(line)) continue;

    // trailing options
    let opts = {};
    const optSplit = line.split('||');
    if (optSplit.length > 1) { opts = parseOpts(optSplit.pop()); line = optSplit.join('||'); }
    line = line.trim();

    // ── directives ──
    if (line.startsWith('@')) {
      const m = /^@(\w+)\s*(.*)$/.exec(line);
      if (!m) { warnings.push(`Line ${li + 1}: bad directive`); continue; }
      const cmd = m[1].toLowerCase();
      const arg = stripQuotes(m[2]);
      switch (cmd) {
        case 'contact': case 'chat': case 'with':
          current = scene(arg); break;
        case 'me': case 'user':
          meName = arg || meName;
          if (current) current.meName = meName; break;
        case 'avatar': case 'pfp':
          (current || scene(defaults.contactName || 'Chat')).contactAvatar = arg; break;
        case 'myavatar': case 'mypfp':
          (current || scene(defaults.contactName || 'Chat')).meAvatar = arg; break;
        case 'wallpaper': case 'bg':
          (current || scene(defaults.contactName || 'Chat')).wallpaper = arg; break;
        case 'clock': case 'time':
          (current || scene(defaults.contactName || 'Chat')).clock = arg || '9:41 PM'; break;
        case 'online': addStatus({ mode: 'online' }); break;
        case 'offline': addStatus({ mode: 'offline' }); break;
        case 'lastseen': addStatus({ mode: 'lastseen', text: arg || 'recently' }); break;
        case 'typing': addStatus({ mode: 'typing', text: arg || 'typing…' }); break;
        case 'status': addStatus({ mode: 'custom', text: arg }); break;
        case 'wait': case 'pause': case 'gap': {
          const sc = current || scene(defaults.contactName || 'Chat');
          sc.pendingWait += parseFloat(arg) || 0; break;
        }
        case 'date': push(mkSystem(arg || 'Today', { ...opts, kind: 'date' })).kind = 'date'; break;
        case 'system': case 'note': push(mkSystem(arg, opts)).kind = 'note'; break;
        default: warnings.push(`Line ${li + 1}: unknown directive @${cmd}`);
      }
      continue;
    }

    // ── Contact ~ / Trigger ~ / Reply ~ format ──
    if (/(^|,)\s*(contact|trigger|reply)\s*~/i.test(line)) {
      const fields = {};
      const re = new RegExp(`(\\w+)\\s*~\\s*(${Q}([\\s\\S]*?)${Q}|[^,]+)`, 'gi');
      let mm;
      while ((mm = re.exec(line))) {
        const key = mm[1].toLowerCase();
        const val = mm[3] !== undefined ? mm[3] : stripQuotes(mm[2]);
        if (fields[key] === undefined) fields[key] = [];
        fields[key].push(val);
      }
      if (fields.contact) current = scene(stripQuotes(fields.contact[0]));
      if (!current) current = scene(defaults.contactName || 'Chat');
      (fields.trigger || []).forEach((t) => { if (t.trim()) push(mkMsg('me', t, opts)); });
      (fields.reply || []).forEach((r) => { if (r.trim()) push(mkMsg('them', r, opts)); });
      if (!fields.trigger && !fields.reply && fields.contact) { /* contact switch only */ }
      continue;
    }

    // ── shorthand > / < ──
    if (/^[><]/.test(line)) {
      const from = line[0] === '>' ? 'me' : 'them';
      push(mkMsg(from, line.slice(1).trim(), opts));
      continue;
    }

    // ── "Name: message" ──
    const nm = /^([^:]{1,32}):\s*([\s\S]*)$/.exec(line);
    if (nm) {
      const who = nm[1].trim();
      const body = nm[2];
      const lw = who.toLowerCase();
      if (lw === 'me' || lw === 'you' || lw === meName.toLowerCase() || lw === 'i') {
        push(mkMsg('me', body, opts));
      } else {
        if (!current || (current.contactName.toLowerCase() !== lw && !scenes.has(who))) {
          // new speaker → treat as the contact of a (possibly new) scene
          if (!current) current = scene(who);
          else if (current.contactName.toLowerCase() !== lw) current = scene(who);
        }
        push(mkMsg('them', body, opts));
      }
      continue;
    }

    // ── bare line → continuation of previous, else incoming ──
    const sc = current || scene(defaults.contactName || 'Chat');
    const last = sc.messages[sc.messages.length - 1];
    if (last && last.type !== 'system' && !/^\s*$/.test(line)) {
      last.text = (last.text ? last.text + '\n' : '') + line.trim();
    } else {
      push(mkMsg('them', line, opts));
    }
  }

  const out = Array.from(scenes.values()).filter((s) => s.messages.length);
  if (!out.length) warnings.push('No messages found in script.');
  return { scenes: out, warnings };
}

/** Serialise a scene back out to script text (round-trip / export). */
export function sceneToScript(scene) {
  const L = [];
  L.push(`@contact "${scene.contactName}"`);
  if (scene.meName) L.push(`@me "${scene.meName}"`);
  if (scene.clock) L.push(`@clock "${scene.clock}"`);
  L.push('');
  for (const m of scene.messages) {
    if (m.from === 'system') { L.push(`@${m.kind === 'date' ? 'date' : 'system'} "${m.text}"`); continue; }
    const who = m.from === 'me' ? (scene.meName || 'Me') : scene.contactName;
    const body = m.type === 'image' ? `[img ${m.img}]${m.text ? ' ' + m.text : ''}` : m.text.replace(/\n/g, ' ');
    const opts = [];
    if (m.from === 'me' && m.typeDur != null) opts.push(`typing=${+m.typeDur.toFixed(2)}`);
    if (m.from === 'them' && m.dotsDur != null) opts.push(`dots=${+m.dotsDur.toFixed(2)}`);
    L.push(`${who}: ${body}${opts.length ? ' || ' + opts.join(' ') : ''}`);
  }
  return L.join('\n');
}

export const SAMPLE_SCRIPT = `# Chatter Studio — sample script
@contact "Amaira"
@me "Reyansh"
@clock "9:41 PM"
@avatar avatars/amaira.jpg
@date "Today"
@online

Amaira: okay so today was SO chaotic 😭
Me: lol tell me everything || typing=1.8
Amaira: first the projector died mid-presentation, then Zara spilled chai all over the scripts
Me: no way 💀 the final drafts??
Amaira: yesss. luckily I had backups on drive 🙏 || dots=2.1
@wait 1.2
@offline
Me: you free sunday? || typing=1.4
@wait 2.5
@online
Amaira: haan! finally free this Sunday 🎬
`;

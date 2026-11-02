/**
 * terminal.js — NightOwl BBS keyboard-first terminal renderer
 * State machine: CONNECT → LOGIN → MENU → BASES → THREADLIST → THREAD
 *                → COMPOSE → SUMMARY → SYSOP → ONLINE → BULLETINS → BYE
 *
 * The .ans files use real ANSI escape codes + CP437 box-drawing bytes.
 * We fetch them as binary (Latin-1) and run them through our ANSI→HTML
 * renderer which also maps CP437 high-bytes to Unicode.
 */

// ── DOM refs ──────────────────────────────────────────────────────────────────
const screen   = document.getElementById('screen');
const terminal = document.getElementById('terminal');

// ── App state ─────────────────────────────────────────────────────────────────
let state            = 'CONNECT';   // current screen state
let handle           = '';          // logged-in handle
let bases            = [];          // [{id,name,description}]
let currentBase      = null;        // selected base object
let currentThreadList = { threads: [], page: 1, pages: 1 };
let currentThread    = null;        // thread object from GET /api/threads/:id
let composeTarget    = null;        // 'thread' | 'reply'
let composeStep      = 0;           // 0=subject, 1=body (for new thread)
let composeDraft     = { subject: '', body: '' };
let sysopHistory     = [];          // [{who:'caller'|'sysop', text}]
let inputBuffer      = '';          // current text input
let onlineCallers    = [];          // [{handle, lastSeen}]

// ── ANSI SGR color table (standard 16-color) ───────────────────────────────
const ANSI_COLORS = [
  '#1a1a1a', // 0  black
  '#cc0000', // 1  red
  '#00cc00', // 2  green
  '#cccc00', // 3  yellow
  '#0000cc', // 4  blue
  '#cc00cc', // 5  magenta
  '#00cccc', // 6  cyan
  '#cccccc', // 7  white
  '#555555', // 8  bright black
  '#ff5555', // 9  bright red
  '#55ff55', // 10 bright green
  '#ffff55', // 11 bright yellow
  '#5555ff', // 12 bright blue
  '#ff55ff', // 13 bright magenta
  '#55ffff', // 14 bright cyan
  '#ffffff', // 15 bright white
];

// ── CP437 → Unicode mapping for bytes 0x80-0xFF ───────────────────────────
// Only the characters actually used in BBS art (box-drawing, block elements).
const CP437 = {
  0x80:'\u00C7', 0x81:'\u00FC', 0x82:'\u00E9', 0x83:'\u00E2',
  0x84:'\u00E4', 0x85:'\u00E0', 0x86:'\u00E5', 0x87:'\u00E7',
  0x88:'\u00EA', 0x89:'\u00EB', 0x8A:'\u00E8', 0x8B:'\u00EF',
  0x8C:'\u00EE', 0x8D:'\u00EC', 0x8E:'\u00C4', 0x8F:'\u00C5',
  0x90:'\u00C9', 0x91:'\u00E6', 0x92:'\u00C6', 0x93:'\u00F4',
  0x94:'\u00F6', 0x95:'\u00F2', 0x96:'\u00FB', 0x97:'\u00F9',
  0x98:'\u00FF', 0x99:'\u00D6', 0x9A:'\u00DC', 0x9B:'\u00A2',
  0x9C:'\u00A3', 0x9D:'\u00A5', 0x9E:'\u20A7', 0x9F:'\u0192',
  0xA0:'\u00E1', 0xA1:'\u00ED', 0xA2:'\u00F3', 0xA3:'\u00FA',
  0xA4:'\u00F1', 0xA5:'\u00D1', 0xA6:'\u00AA', 0xA7:'\u00BA',
  0xA8:'\u00BF', 0xA9:'\u2310', 0xAA:'\u00AC', 0xAB:'\u00BD',
  0xAC:'\u00BC', 0xAD:'\u00A1', 0xAE:'\u00AB', 0xAF:'\u00BB',
  0xB0:'\u2591', 0xB1:'\u2592', 0xB2:'\u2593', 0xB3:'\u2502',
  0xB4:'\u2524', 0xB5:'\u2561', 0xB6:'\u2562', 0xB7:'\u2556',
  0xB8:'\u2555', 0xB9:'\u2563', 0xBA:'\u2551', 0xBB:'\u2557',
  0xBC:'\u255D', 0xBD:'\u255C', 0xBE:'\u255B', 0xBF:'\u2510',
  0xC0:'\u2514', 0xC1:'\u2534', 0xC2:'\u252C', 0xC3:'\u251C',
  0xC4:'\u2500', 0xC5:'\u253C', 0xC6:'\u255E', 0xC7:'\u255F',
  0xC8:'\u255A', 0xC9:'\u2554', 0xCA:'\u2569', 0xCB:'\u2566',
  0xCC:'\u2560', 0xCD:'\u2550', 0xCE:'\u256C', 0xCF:'\u2567',
  0xD0:'\u2568', 0xD1:'\u2564', 0xD2:'\u2565', 0xD3:'\u2559',
  0xD4:'\u2558', 0xD5:'\u2552', 0xD6:'\u2553', 0xD7:'\u256B',
  0xD8:'\u256A', 0xD9:'\u2518', 0xDA:'\u250C', 0xDB:'\u2588',
  0xDC:'\u2584', 0xDD:'\u258C', 0xDE:'\u2590', 0xDF:'\u2580',
  0xE0:'\u03B1', 0xE1:'\u00DF', 0xE2:'\u0393', 0xE3:'\u03C0',
  0xE4:'\u03A3', 0xE5:'\u03C3', 0xE6:'\u00B5', 0xE7:'\u03C4',
  0xE8:'\u03A6', 0xE9:'\u0398', 0xEA:'\u03A9', 0xEB:'\u03B4',
  0xEC:'\u221E', 0xED:'\u03C6', 0xEE:'\u03B5', 0xF0:'\u2261',
  0xF1:'\u00B1', 0xF2:'\u2265', 0xF3:'\u2264', 0xF4:'\u2320',
  0xF5:'\u2321', 0xF6:'\u00F7', 0xF7:'\u2248', 0xF8:'\u00B0',
  0xF9:'\u2219', 0xFA:'\u00B7', 0xFB:'\u221A', 0xFC:'\u207F',
  0xFD:'\u00B2', 0xFE:'\u25A0', 0xFF:'\u00A0',
};

// ── Inline ANSI color codes for building screens ─────────────────────────────
const C = {
  reset:    '\x1b[0m',
  bold:     '\x1b[1m',
  black:    '\x1b[30m', red:     '\x1b[31m', green:   '\x1b[32m',
  yellow:   '\x1b[33m', blue:    '\x1b[34m', magenta: '\x1b[35m',
  cyan:     '\x1b[36m', white:   '\x1b[37m',
  bBlack:   '\x1b[90m', bRed:    '\x1b[91m', bGreen:  '\x1b[92m',
  bYellow:  '\x1b[93m', bBlue:   '\x1b[94m', bMagenta:'\x1b[95m',
  bCyan:    '\x1b[96m', bWhite:  '\x1b[97m',
};



// ── ANSI SGR → HTML ───────────────────────────────────────────────────────────
// Handles: reset(0), bold(1), blink(5), fg 30-37/90-97, bg 40-47/100-107.
// Ignores cursor movement (2J, H, etc.) — those are only in .ans files where
// we strip them at fetch time.
function ansiToHtml(input) {
  const ANSI_RE = /\x1b\[(\d*(?:;\d*)*)([A-Za-z])/g;
  let sgr = { fg: null, bg: null, bold: false, blink: false };
  let html = '';
  let lastIndex = 0;
  let spanOpen = false;

  const closeSpan = () => {
    if (spanOpen) { html += '</span>'; spanOpen = false; }
  };

  let m;
  while ((m = ANSI_RE.exec(input)) !== null) {
    // Emit literal text between last match and this one
    const text = input.slice(lastIndex, m.index);
    if (text) html += escHtml(text);
    lastIndex = ANSI_RE.lastIndex;

    if (m[2] === 'm') {
      const params = m[1] ? m[1].split(';').map(Number) : [0];
      closeSpan();
      for (const p of params) {
        if      (p === 0)                  sgr = { fg:null, bg:null, bold:false, blink:false };
        else if (p === 1)                  sgr.bold  = true;
        else if (p === 5 || p === 6)       sgr.blink = true;
        else if (p >= 30 && p <= 37)       sgr.fg = p - 30;
        else if (p === 39)                 sgr.fg = null;
        else if (p >= 40 && p <= 47)       sgr.bg = p - 40;
        else if (p === 49)                 sgr.bg = null;
        else if (p >= 90 && p <= 97)       sgr.fg = p - 90 + 8;
        else if (p >= 100 && p <= 107)     sgr.bg = p - 100 + 8;
      }
      const styles = [];
      if (sgr.fg !== null) {
        const idx = sgr.bold ? (sgr.fg | 8) : sgr.fg;
        styles.push(`color:${ANSI_COLORS[idx & 15]}`);
      } else if (sgr.bold) {
        styles.push('font-weight:bold');
      }
      if (sgr.bg !== null) {
        styles.push(`background:${ANSI_COLORS[sgr.bg & 15]}`);
      }
      if (styles.length) {
        const blinkCls = sgr.blink ? ' class="blink"' : '';
        html += `<span style="${styles.join(';')}"${blinkCls}>`;
        spanOpen = true;
      }
    }
    // All other escape sequences (cursor movement, clear screen) are ignored
  }

  const tail = input.slice(lastIndex);
  if (tail) html += escHtml(tail);
  closeSpan();
  return html;
}

// ── CP437 binary string → UTF-16 string ──────────────────────────────────────
// Fetch .ans as Latin-1 bytes; each byte 0x80-0xFF is CP437.
function cp437ToString(binaryStr) {
  let out = '';
  for (let i = 0; i < binaryStr.length; i++) {
    const code = binaryStr.charCodeAt(i);
    if (code >= 0x80) {
      out += CP437[code] || '?';
    } else if (code === 0x1A) {
      // DOS EOF marker — stop here
      break;
    } else {
      out += binaryStr[i];
    }
  }
  return out;
}

// ── Fetch an .ans file, decode CP437, strip cursor-movement escapes ──────────
// Returns a string of HTML ready to inject.
async function loadAns(path) {
  try {
    const res = await fetch(path);
    // Read as binary (Latin-1)
    const buf = await res.arrayBuffer();
    const bytes = String.fromCharCode(...new Uint8Array(buf));
    const text = cp437ToString(bytes);
    // Strip clear-screen / cursor-position sequences but keep SGR colour codes
    const stripped = text.replace(/\x1b\[\d*[ABCDHJ]/g, '').replace(/\x1b\[\??\d*[lh]/g, '');
    return ansiToHtml(stripped);
  } catch {
    return '';
  }
}

// ── Render helpers ────────────────────────────────────────────────────────────
function render(html) {
  screen.innerHTML = html + '<span id="cursor"></span>';
  terminal.scrollTop = terminal.scrollHeight;
}

/** HTML escape function — only for values that will NOT be passed to ansiToHtml() */
function escapeForHtml(t) {
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Convert one line of ANSI-coded text to an HTML fragment ending with \n */
function line(text = '') {
  return ansiToHtml(text) + '\n';
}

/** Horizontal rule */
function hline(char = '─', width = 78) {
  return line(C.bBlack + char.repeat(width) + C.reset);
}

/** Centre text within `width` columns (strips ANSI codes for measurement) */
function center(text, width = 80) {
  const visible = text.replace(/\x1b\[[^m]*m/g, '');
  const pad = Math.max(0, Math.floor((width - visible.length) / 2));
  return ' '.repeat(pad) + text;
}

/** Word-wrap text to fit within a column width, preserving ANSI codes */
function wordWrap(text, width = 76) {
  const lines = text.split('\n');
  const wrapped = [];
  
  for (const l of lines) {
    // Strip ANSI codes to measure visible width
    const visible = l.replace(/\x1b\[[^m]*m/g, '');
    
    if (visible.length <= width) {
      wrapped.push(l);
      continue;
    }
    
    // Need to wrap: find word boundaries and preserve ANSI codes
    let current = '';
    let currentVisible = '';
    const words = l.split(' ');
    
    for (const word of words) {
      const wordVisible = word.replace(/\x1b\[[^m]*m/g, '');
      const tryLine = currentVisible ? currentVisible + ' ' + wordVisible : wordVisible;
      
      if (tryLine.length <= width) {
        current = currentVisible ? current + ' ' + word : word;
        currentVisible = tryLine;
      } else {
        if (current) wrapped.push(current);
        current = word;
        currentVisible = wordVisible;
      }
    }
    if (current) wrapped.push(current);
  }
  
  return wrapped.join('\n');
}

/** ASCII-art logo rendered via ANSI colours */
function logo() {
  return [
    line(center(C.bYellow + '███╗   ██╗██╗ ██████╗ ██╗  ██╗████████╗ ██████╗ ██╗    ██╗██╗'  + C.reset)),
    line(center(C.bYellow + '████╗  ██║██║██╔════╝ ██║  ██║╚══██╔══╝██╔═══██╗██║    ██║██║'  + C.reset)),
    line(center(C.yellow  + '██╔██╗ ██║██║██║  ███╗███████║   ██║   ██║   ██║██║ █╗ ██║██║'  + C.reset)),
    line(center(C.yellow  + '██║╚██╗██║██║██║   ██║██╔══██║   ██║   ██║   ██║██║███╗██║██║'  + C.reset)),
    line(center(C.bYellow + '██║ ╚████║██║╚██████╔╝██║  ██║   ██║   ╚██████╔╝╚███╔███╔╝███████╗' + C.reset)),
    line(center(C.bBlack  + '╚═╝  ╚═══╝╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝    ╚═════╝  ╚══╝╚══╝ ╚══════╝' + C.reset)),
    line(center(C.bMagenta + 'B  B  S' + C.reset + '   ' + C.bBlack + 'Node 1 of 1  ·  Est. 1994' + C.reset)),
  ].join('');
}

// ── API helper ────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  // Demo mode: route through localStorage-backed demo-api.js instead of fetch
  if (window.__demoMode && window.__demoApi) {
    return window.__demoApi(method, path, body ?? undefined);
  }
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(path, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json;
  } catch (err) {
    // If backend is unreachable and demo-api is available, auto-enable demo mode
    if (window.__demoApi && !window.__demoMode) {
      window.__demoMode = true;
      if (window.__demoActivate) window.__demoActivate();
      // Retry the call in demo mode
      return window.__demoApi(method, path, body ?? undefined);
    }
    return { error: String(err) };
  }
}

// ── Auto-detect backend at boot ────────────────────────────────────────────────
// Try to fetch a simple API endpoint; if it fails, enable demo mode.
async function detectBackend() {
  if (window.__demoMode || !window.__demoApi) return; // Already in demo mode or no demo available
  try {
    const res = await fetch('api/bases', { method: 'GET' });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      // Backend is reachable — normal mode
      return;
    }
  } catch { /* ignore */ }
  // Backend unreachable — enable demo mode
  window.__demoMode = true;
  if (window.__demoActivate) window.__demoActivate();
}

// ── SSE — real-time updates ───────────────────────────────────────────────────
// In demo mode use the localStorage-backed shim; otherwise connect to the server.
let evtSource = null;

function connectEvents() {
  evtSource = (window.__demoMode && window.__makeDemoEventSource)
    ? window.__makeDemoEventSource()
    : new EventSource('api/events');

  evtSource.addEventListener('online', e => {
    onlineCallers = JSON.parse(e.data);
    if (state === 'ONLINE') renderOnline();
    if (state === 'MENU') renderMenu(); // Refresh online count in menu
  });

  evtSource.addEventListener('newthread', e => {
    if (state === 'THREADLIST' && currentBase) {
      const d = JSON.parse(e.data);
      if (d.baseId === currentBase.id) renderBaseThreads(currentThreadList.page);
    }
  });

  evtSource.addEventListener('newpost', () => {
    if (state === 'THREAD' && currentThread) renderThread();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Screen renderers
// ═══════════════════════════════════════════════════════════════════════════════

// ── CONNECT ── modem handshake animation ──────────────────────────────────────
async function renderConnect() {
  state = 'CONNECT';
  inputBuffer = '';

  // Show the .ans connect art as backdrop, then animate modem lines on top
  const ansHtml = await loadAns('./screens/connect.ans');

  const frameLines = [
    { text: '',                                              delay:   0 },
    { text: C.bGreen  + 'ATZ'           + C.reset,          delay: 200 },
    { text: C.bGreen  + 'OK'            + C.reset,          delay: 600 },
    { text: C.green   + 'ATDT 619-555-0194' + C.reset,      delay: 1000 },
    { text: '',                                              delay: 1400 },
    { text: C.bYellow + 'RINGING...'    + C.reset,          delay: 1600 },
    { text: '',                                              delay: 2000 },
    { text: C.bWhite  + 'CONNECT 14400' + C.reset,          delay: 2400 },
    { text: C.bBlack  + '~~~~||||||||||||||||||||||||||||||||||||~~~~' + C.reset, delay: 2600 },
    { text: '',                                              delay: 2900 },
    { text: C.bYellow + '*** ENTER YOUR HANDLE TO CONTINUE ***' + C.reset,       delay: 3100 },
  ];

  // Build the initial display using the .ans art
  let html = ansHtml + '\n';
  render(html);

  let accumulated = html;
  frameLines.forEach(({ text, delay }) => {
    setTimeout(() => {
      if (state !== 'CONNECT') return;
      accumulated += text ? line(text) : '\n';
      render(accumulated);
    }, delay);
  });

  setTimeout(() => {
    if (state === 'CONNECT') renderWelcome();
  }, 3800);
}

// ── LOGIN ── handle prompt ────────────────────────────────────────────────────
function renderWelcome() {
  state = 'LOGIN';
  let html = '';
  html += logo();
  html += hline();
  html += line(center(C.bCyan + '🦉  Welcome to NightOwl BBS  🦉' + C.reset));
  html += line(center(C.bBlack + 'NightOwlOS v2.31 · 486DX2-66 · USR Courier 14.4k Sportster' + C.reset));
  html += hline();
  html += line();
  html += line(C.bWhite + 'What is your handle?' + C.reset + '  ' + C.bBlack + '(3-16 chars · A-Z a-z 0-9 _)' + C.reset);
  html += line();
  html += line(C.bYellow + '> ' + C.reset + String(inputBuffer));
  render(html);
}

// ── MENU ── main navigation ───────────────────────────────────────────────────
function renderMenu() {
  state = 'MENU';
  let html = '';
  html += logo();
  html += hline();
  html += line(
    C.bGreen + '  Welcome, ' + C.bWhite + String(handle) + C.bGreen +
    '!  Callers online: ' + C.bWhite + onlineCallers.length + C.reset
  );
  html += hline();
  html += line();
  html += line(center(C.bYellow + '╔══════════════════════╗' + C.reset));
  html += line(center(C.bYellow + '║  ' + C.bWhite + 'M A I N   M E N U' + C.bYellow + '   ║' + C.reset));
  html += line(center(C.bYellow + '╚══════════════════════╝' + C.reset));
  html += line();
  html += line(center(
    C.bCyan + '[M]' + C.reset + C.white + ' Message Bases     ' +
    C.bCyan + '[W]' + C.reset + C.white + " Who's Online"
  ));
  html += line(center(
    C.bCyan + '[S]' + C.reset + C.white + ' Talk to SysOp     ' +
    C.bCyan + '[B]' + C.reset + C.white + ' Bulletins'
  ));
  html += line(center(
    C.bCyan + '[G]' + C.reset + C.white + ' Goodbye'
  ));
  html += line();
  html += hline();
  html += line(C.bBlack + '  Press a highlighted key...' + C.reset);
  render(html);
}

// ── BASES ── list message bases ───────────────────────────────────────────────
function renderBases() {
  state = 'BASES';
  let html = '';
  html += logo();
  html += hline();
  html += line(center(C.bYellow + 'M E S S A G E   B A S E S' + C.reset));
  html += hline();
  html += line();
  bases.forEach((b, i) => {
    html += line(
      `  ${C.bCyan}[${i + 1}]${C.reset}  ${C.bWhite}${String(b.name)}${C.reset}` +
      `  ${C.bBlack}— ${String(b.description)}${C.reset}`
    );
  });
  html += line();
  html += hline();
  html += line(C.bBlack + `  Press [1]-[${bases.length}] to enter a base, or [Q] to return.` + C.reset);
  render(html);
}

// ── THREADLIST ── thread index for a base ─────────────────────────────────────
async function renderBaseThreads(page = 1) {
  state = 'THREADLIST';
  const data = await api('GET', `api/bases/${currentBase.id}/threads?page=${page}`);
  if (data.error) { renderMenu(); return; }
  currentThreadList = data;

  let html = '';
  html += logo();
  html += hline();
  html += line(
    center(
      C.bYellow + 'BASE: ' + C.bWhite + String(currentBase.name) + C.reset +
      C.bBlack  + `  (Page ${data.page} of ${data.pages})` + C.reset
    )
  );
  html += hline();

  if (data.threads.length === 0) {
    html += line();
    html += line(center(C.bBlack + '--- No messages yet. Be the first! ---' + C.reset));
  } else {
    html += line();
    // Header
    html += line(
      C.bBlack +
      ' Num  Subject' + ' '.repeat(41) + 'From         Date      Rpl' +
      C.reset
    );
    html += hline('·');
    data.threads.forEach((t, i) => {
      const num    = String((page - 1) * 15 + i + 1).padStart(3);
      const subj   = String(t.subject).slice(0, 46).padEnd(46);
      const from   = String(t.posts[0].author).slice(0, 12).padEnd(12);
      const date   = new Date(t.posts[0].ts).toLocaleDateString('en-US', { month:'2-digit', day:'2-digit', year:'2-digit' });
      const rep    = String(Math.max(0, t.posts.length - 1)).padStart(3);
      html += line(
        `${C.bCyan}${num}.${C.reset} ` +
        `${C.bWhite}${subj}${C.reset} ` +
        `${C.bGreen}${from}${C.reset} ` +
        `${C.bBlack}${date} ${rep}r${C.reset}`
      );
    });
  }

  html += line();
  html += hline();
  html += line(C.bBlack + '  [N]ext  [P]rev  [#] read  [C]ompose  [Q] back' + C.reset);
  render(html);
}

// ── THREAD ── read a thread ───────────────────────────────────────────────────
async function renderThread() {
  state = 'THREAD';
  const data = await api('GET', `api/threads/${currentThread.id}`);
  if (data.error) { await renderBaseThreads(currentThreadList.page); return; }
  currentThread = data;

  let html = '';
  html += logo();
  html += hline();
  html += line(C.bYellow + ' THREAD: ' + C.bWhite + String(data.subject) + C.reset);
  html += hline();

  const visible = data.posts.filter(p => !p.held);
  if (visible.length === 0) {
    html += line();
    html += line(center(C.bBlack + '--- Post held for review by SysOp. ---' + C.reset));
  } else {
    visible.forEach((p, i) => {
      const date = new Date(p.ts).toLocaleString();
      html += line();
      html += line(
        `${C.bCyan} Post #${i + 1}${C.reset}` +
        `  ${C.bGreen}From: ${String(p.author)}${C.reset}` +
        `  ${C.bBlack}${date}${C.reset}`
      );
      html += hline('·');
      // Word-wrap body at 78 chars - body is raw text, will be escaped by ansiToHtml
      const words = p.body.split(/( +|\n)/);
      let col = 0;
      let row = ' ';
      for (const w of words) {
        if (w === '\n' || w === '\r\n') {
          html += line(C.white + row + C.reset);
          row = ' '; col = 0;
        } else if (col + w.length > 77) {
          html += line(C.white + row + C.reset);
          row = ' ' + w.trimStart(); col = row.length;
        } else {
          row += w; col += w.length;
        }
      }
      if (row.trim()) html += line(C.white + row + C.reset);
    });
  }

  html += line();
  html += hline();
  html += line(C.bBlack + '  [R]eply  [Z] SysOp summary  [Q] back to thread list' + C.reset);
  render(html);
}

// ── COMPOSE ── new thread or reply ────────────────────────────────────────────
function renderCompose(type) {
  state = 'COMPOSE';
  composeTarget = type;
  composeStep   = 0;
  composeDraft  = { subject: '', body: '' };
  inputBuffer   = '';
  _drawCompose();
}

function _drawCompose() {
  let html = logo() + hline();
  const title = composeTarget === 'thread' ? 'N E W   T H R E A D' : 'N E W   R E P L Y';
  html += line(center(C.bYellow + title + C.reset));
  html += hline();
  html += line();

  if (composeTarget === 'thread') {
    if (composeStep === 0) {
      html += line(C.bWhite + ' Subject: ' + C.reset + String(inputBuffer));
      html += line();
      html += line(C.bBlack + ' [Enter] next · [Esc] cancel' + C.reset);
    } else {
      html += line(C.bWhite + ' Subject: ' + C.reset + String(composeDraft.subject));
      html += line();
      html += line(C.bWhite + '    Body: ' + C.reset + String(inputBuffer));
      html += line();
      html += line(C.bBlack + ' [Enter] post · [Esc] cancel' + C.reset);
    }
  } else {
    html += line(C.bWhite + ' Replying to: ' + C.reset + String(currentThread.subject));
    html += line();
    html += line(C.bWhite + '      Reply: ' + C.reset + String(inputBuffer));
    html += line();
    html += line(C.bBlack + ' [Enter] post · [Esc] cancel' + C.reset);
  }
  render(html);
}

// ── SYSOP CHAT ────────────────────────────────────────────────────────────────
function renderSysop() {
  state = 'SYSOP';
  let html = '';
  html += logo();
  html += hline();
  html += line(center(C.bYellow + '~~ S Y S O P   C H A T ~~' + C.reset));
  html += line(center(C.bBlack + 'Chatting with NightOwl (the SysOp). Type /quit to exit.' + C.reset));
  html += hline();
  html += line();

  // Last N exchanges (keep it within ~25 lines budget)
  const show = sysopHistory.slice(-10);
  show.forEach(({ who, text }) => {
    const color = who === 'sysop' ? C.bGreen : C.bCyan;
    const name  = who === 'sysop' ? 'SysOp' : String(handle);
    // Word-wrap long replies to fit in 76 columns
    const wrapped = wordWrap(text, 76);
    wrapped.split('\n').forEach(l => {
      html += line(`${color}[${name}]${C.reset} ${String(l)}`);
    });
  });

  html += line();
  html += line(C.bYellow + '> ' + C.reset + String(inputBuffer));
  render(html);
}

// ── WHO'S ONLINE ──────────────────────────────────────────────────────────────
function renderOnline() {
  state = 'ONLINE';
  let html = '';
  html += logo();
  html += hline();
  html += line(center(C.bYellow + "W H O ' S   O N L I N E" + C.reset));
  html += hline();
  html += line();

  if (onlineCallers.length === 0) {
    html += line(center(C.bBlack + '--- No callers online right now ---' + C.reset));
  } else {
    html += line(C.bBlack + '  Handle           Last Seen' + C.reset);
    html += hline('·');
    onlineCallers.forEach(c => {
      const when = new Date(c.lastSeen).toLocaleTimeString();
      html += line(
        `  ${C.bGreen}●${C.reset} ${C.bWhite}${String(c.handle).padEnd(16)}${C.reset}` +
        `  ${C.bBlack}${when}${C.reset}`
      );
    });
  }

  html += line();
  html += hline();
  html += line(C.bBlack + '  Press any key to return to the main menu.' + C.reset);
  render(html);
}

// ── BULLETINS ─────────────────────────────────────────────────────────────────
function renderBulletins() {
  state = 'BULLETINS';
  let html = '';
  html += logo();
  html += hline();
  html += line(center(C.bYellow + 'B U L L E T I N S' + C.reset));
  html += hline();
  html += line();
  html += line(C.bCyan + ' #1  ' + C.bWhite + 'Welcome to NightOwl BBS!' + C.reset);
  html += line(C.bBlack + '      Posted by SysOp  ·  11/01/1994' + C.reset);
  html += line();
  html += line(C.white + '      This board runs 24/7 on a trusty 486DX2-66.' + C.reset);
  html += line(C.white + '      Message bases: General, Retro Tech, Halloween.' + C.reset);
  html += line(C.white + '      The SysOp is always watching... 👁' + C.reset);
  html += line();
  html += line(C.bCyan + ' #2  ' + C.bWhite + 'Board Rules' + C.reset);
  html += line(C.bBlack + '      Posted by SysOp  ·  11/01/1994' + C.reset);
  html += line();
  html += line(C.white + '      1. Be excellent to each other.' + C.reset);
  html += line(C.white + '      2. No warez, no spam, no drama.' + C.reset);
  html += line(C.white + '      3. Retro tech talk is highly encouraged.' + C.reset);
  html += line(C.white + '      4. Halloween base is peak season Oct-Nov.' + C.reset);
  html += line();
  html += hline();
  html += line(C.bBlack + '  Press any key to return to the main menu.' + C.reset);
  render(html);
}

// ── GOODBYE / NO CARRIER ─────────────────────────────────────────────────────
async function renderBye() {
  state = 'BYE';
  const ansHtml = await loadAns('./screens/goodbye.ans');

  let html = ansHtml + '\n';
  html += line();
  html += line(center(C.bGreen + 'Thanks for calling NightOwl BBS!' + C.reset));
  html += line(center(C.bBlack + 'So long, ' + String(handle) + '. Come back soon!' + C.reset));
  html += line();
  html += line(center(C.bRed + '\u2593\u2592\u2591  N O   C A R R I E R  \u2591\u2592\u2593' + C.reset));
  html += line();
  html += line(center(C.bBlack + '...returning to connect screen in 3 seconds...' + C.reset));
  render(html);

  // Reset all session state
  handle       = '';
  inputBuffer  = '';
  sysopHistory = [];
  currentBase  = null;
  currentThread = null;

  setTimeout(() => renderConnect(), 3000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Keyboard input handler
// ═══════════════════════════════════════════════════════════════════════════════

terminal.addEventListener('keydown', async (e) => {
  // Suppress browser shortcuts that would interfere with terminal feel
  if (['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
  }
  // Suppress Ctrl+key combinations (except Ctrl+C which the browser handles)
  if (e.ctrlKey && e.key !== 'c') {
    e.preventDefault();
  }

  const key = e.key;

  // ── CONNECT: no input ──────────────────────────────────────────────────────
  if (state === 'CONNECT') return;

  // ── BYE: no input ─────────────────────────────────────────────────────────
  if (state === 'BYE') return;

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (state === 'LOGIN') {
    if (key === 'Enter') {
      const h = inputBuffer.trim();
      inputBuffer = '';
      if (!h) { renderWelcome(); return; }

      const result = await api('POST', 'api/login', { handle: h });
      if (result.error) {
        let html = logo() + hline();
        // Strip any HTML tags that might come back from the server's ansiToHtml
        const errText = result.error.replace(/<[^>]+>/g, '');
        html += line(C.bRed + ' Error: ' + C.reset + String(errText));
        html += line();
        html += line(C.bWhite + 'Handle: ' + C.reset + String(inputBuffer));
        html += line();
        html += line(C.bBlack + ' Try again (3-16 chars, A-Z a-z 0-9 _)' + C.reset);
        render(html);
      } else {
        handle = h;
        const fetchedBases = await api('GET', 'api/bases');
        bases = Array.isArray(fetchedBases) ? fetchedBases : [];
        renderMenu();
      }
    } else if (key === 'Backspace') {
      inputBuffer = inputBuffer.slice(0, -1);
      renderWelcome();
    } else if (key.length === 1 && /^[A-Za-z0-9_]$/.test(key) && inputBuffer.length < 16) {
      inputBuffer += key;
      renderWelcome();
    }
    return;
  }

  // ── MENU ───────────────────────────────────────────────────────────────────
  if (state === 'MENU') {
    switch (key.toUpperCase()) {
      case 'M': renderBases(); break;
      case 'W': renderOnline(); break;
      case 'S': sysopHistory = []; inputBuffer = ''; renderSysop(); break;
      case 'B': renderBulletins(); break;
      case 'G': renderBye(); break;
    }
    return;
  }

  // ── BASES ──────────────────────────────────────────────────────────────────
  if (state === 'BASES') {
    if (key.toUpperCase() === 'Q') { renderMenu(); return; }
    const idx = parseInt(key, 10) - 1;
    if (idx >= 0 && idx < bases.length) {
      currentBase = bases[idx];
      await renderBaseThreads(1);
    }
    return;
  }

  // ── THREADLIST ─────────────────────────────────────────────────────────────
  if (state === 'THREADLIST') {
    const k = key.toUpperCase();
    if (k === 'Q') { renderBases(); return; }
    if (k === 'N' && currentThreadList.page < currentThreadList.pages) {
      await renderBaseThreads(currentThreadList.page + 1); return;
    }
    if (k === 'P' && currentThreadList.page > 1) {
      await renderBaseThreads(currentThreadList.page - 1); return;
    }
    if (k === 'C') { renderCompose('thread'); return; }
    const idx = parseInt(key, 10) - 1;
    if (idx >= 0 && idx < currentThreadList.threads.length) {
      currentThread = currentThreadList.threads[idx];
      await renderThread();
    }
    return;
  }

  // ── THREAD ─────────────────────────────────────────────────────────────────
  if (state === 'THREAD') {
    const k = key.toUpperCase();
    if (k === 'Q') { await renderBaseThreads(currentThreadList.page); return; }
    if (k === 'R') { renderCompose('reply'); return; }
    if (k === 'Z') {
      // Show "please wait" immediately
      let html = logo() + hline();
      html += line(center(C.bYellow + 'THREAD SUMMARY — by SysOp' + C.reset));
      html += hline();
      html += line();
      html += line(center(C.bBlack + 'SysOp is reading the thread... please wait...' + C.reset));
      render(html);
      state = 'SUMMARY';

      const data = await api('GET', `api/threads/${currentThread.id}/summary`);
      html = logo() + hline();
      html += line(center(C.bYellow + 'THREAD SUMMARY — by SysOp' + C.reset));
      html += hline();
      html += line();
      const summary = (data.summary || 'No summary available.').trim();
      summary.split('\n').forEach(l => {
        html += line(C.bGreen + '  ' + escHtml(l) + C.reset);
      });
      html += line();
      html += hline();
      html += line(C.bBlack + '  Press any key to return to thread.' + C.reset);
      render(html);
      return;
    }
    return;
  }

  // ── SUMMARY ────────────────────────────────────────────────────────────────
  if (state === 'SUMMARY') {
    await renderThread();
    return;
  }

  // ── COMPOSE ────────────────────────────────────────────────────────────────
  if (state === 'COMPOSE') {
    if (key === 'Escape') {
      inputBuffer = '';
      if (composeTarget === 'thread') await renderBaseThreads(currentThreadList.page);
      else await renderThread();
      return;
    }

    if (key === 'Enter') {
      // New thread: two-step (subject → body)
      if (composeTarget === 'thread' && composeStep === 0) {
        const subj = inputBuffer.trim();
        if (!subj) return; // require non-empty subject
        composeDraft.subject = subj;
        inputBuffer = '';
        composeStep = 1;
        _drawCompose();
        return;
      }

      // Submit
      const body = inputBuffer.trim();
      if (!body) return;
      inputBuffer = '';

      if (composeTarget === 'thread') {
        const t = await api('POST', `api/bases/${currentBase.id}/threads`, {
          subject: composeDraft.subject, author: handle, body
        });
        if (!t.error) {
          currentThread = t;
          await renderBaseThreads(1);
        } else {
          inputBuffer = body; // restore on error
          _drawCompose();
        }
      } else {
        const result = await api('POST', `api/threads/${currentThread.id}/replies`, {
          author: handle, body
        });
        if (result.error) {
          inputBuffer = body;
          _drawCompose();
        } else {
          await renderThread();
        }
      }
      return;
    }

    // Text editing
    if (key === 'Backspace') {
      inputBuffer = inputBuffer.slice(0, -1);
    } else if (key.length === 1 && inputBuffer.length < 500) {
      inputBuffer += key;
    }
    _drawCompose();
    return;
  }

  // ── SYSOP CHAT ─────────────────────────────────────────────────────────────
  if (state === 'SYSOP') {
    if (key === 'Escape' || (key === 'Enter' && inputBuffer.trim() === '/quit')) {
      inputBuffer = '';
      renderMenu();
      return;
    }
    if (key === 'Enter') {
      const msg = inputBuffer.trim();
      inputBuffer = '';
      if (!msg) { renderSysop(); return; }
      sysopHistory.push({ who: 'caller', text: msg });
      renderSysop();
      const data = await api('POST', 'api/sysop/chat', { message: msg, handle });
      sysopHistory.push({ who: 'sysop', text: data.reply || '...' });
      renderSysop();
      return;
    }
    if (key === 'Backspace') {
      inputBuffer = inputBuffer.slice(0, -1);
    } else if (key.length === 1 && inputBuffer.length < 200) {
      inputBuffer += key;
    }
    renderSysop();
    return;
  }

  // ── ONLINE / BULLETINS: any key → menu ────────────────────────────────────
  if (state === 'ONLINE' || state === 'BULLETINS') {
    renderMenu();
    return;
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
  await detectBackend();
  connectEvents();
  renderConnect();
})();

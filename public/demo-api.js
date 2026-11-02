/**
 * demo-api.js — Client-side drop-in for NightOwl BBS (GitHub Pages / static demo).
 *
 * Replaces all fetch() calls to /api/* with localStorage operations so the
 * full board works without a Node.js server.  Seeded with spooky sample
 * threads.  Ghost callers simulate who's-online via periodic fake updates.
 *
 * Usage: loaded by index.html before terminal.js.  Sets window.__demoMode=true
 * and patches window.__demoApi so terminal.js can route through it.
 */

// ── Seed data ─────────────────────────────────────────────────────────────────

const SEED_BASES = [
  { id: 'general',    name: 'General',    description: 'Shoot the breeze' },
  { id: 'retro-tech', name: 'Retro Tech', description: 'Old iron never dies' },
  { id: 'halloween',  name: 'Halloween',  description: 'Tricks, treats & terror' },
];

const SEED_THREADS = [
  {
    id: 'demo-t1',
    baseId: 'halloween',
    subject: 'Anyone else hear that scratching at midnight?',
    posts: [
      { author: 'WitchHazel',  body: 'Three nights running now. Starts at exactly 00:00 and stops at 00:13. The cat won\'t go near the basement door anymore.\n\nI checked the weather logs — no wind. No branches. Just... scratching.', ts: Date.now() - 86400000 * 3 },
      { author: 'GhostBuster9', body: 'Classic poltergeist pattern. Thirteen minutes is significant — prime number of bad luck. Set up a camera facing down.', ts: Date.now() - 86400000 * 2 },
      { author: 'OldSysOp',     body: 'My BBS in \'91 had the same issue. Turned out to be a raccoon. Still scared me half to death every night for two weeks.', ts: Date.now() - 86400000 },
    ],
  },
  {
    id: 'demo-t2',
    baseId: 'halloween',
    subject: 'Best costume you\'ve ever made from scratch?',
    posts: [
      { author: 'CarvingKing',  body: 'Built a full Creature from the Black Lagoon suit out of foam yoga mats and latex paint. Took three weeks. Worth every second when a grown adult screamed and ran.', ts: Date.now() - 86400000 * 5 },
      { author: 'NightOwlSysOp', body: 'Painted myself head-to-toe as a VT100 terminal. Green phosphor face paint, cardboard bezel, the whole bit. Nobody got it but I loved it.', ts: Date.now() - 86400000 * 4 },
    ],
  },
  {
    id: 'demo-t3',
    baseId: 'halloween',
    subject: 'Recommend a genuinely scary movie — not gore, actual dread',
    posts: [
      { author: 'CinemaSpectre', body: 'The Haunting (1963). No jump scares. Just architecture and sound design making you feel the house breathe.', ts: Date.now() - 86400000 * 7 },
      { author: 'WitchHazel',    body: 'Skinamarink (2022) if you want something recent. Slow, oppressive, wrong. Watched it at 2am and immediately turned every light on.', ts: Date.now() - 86400000 * 6 },
      { author: 'GhostBuster9',  body: '+1 The Haunting. Also Picnic at Hanging Rock for existential dread without a single monster.', ts: Date.now() - 86400000 * 6 + 3600000 },
    ],
  },
  {
    id: 'demo-t4',
    baseId: 'general',
    subject: 'Welcome to NightOwl BBS — demo mode active!',
    posts: [
      { author: 'NightOwlSysOp', body: 'You\'re running the static GitHub Pages demo. No server required — everything lives in localStorage.\n\nYou can post, reply, chat with the SysOp (deterministic fallback), and browse all three message bases. Data resets if you clear localStorage.\n\nPress M to explore message bases, W to see who\'s online, S to chat with me. Enjoy!', ts: Date.now() - 3600000 },
    ],
  },
  {
    id: 'demo-t5',
    baseId: 'retro-tech',
    subject: 'Still running my 486 — what\'s your oldest active machine?',
    posts: [
      { author: 'OldSysOp',    body: 'DX2-66 with DOS 6.22 and a 2400 baud modem. Mostly just runs my BBS software but it\'s been on 24/7 for 18 years.', ts: Date.now() - 86400000 * 10 },
      { author: 'RetroRonin',  body: 'Amiga 1200 with a 68030 accelerator. Still the best multitasking OS ever shipped. Fight me.', ts: Date.now() - 86400000 * 9 },
      { author: 'CarvingKing', body: 'SGI Indy running IRIX 6.5. Partly for the aesthetic, partly because the MIPS instruction set is fascinating.', ts: Date.now() - 86400000 * 8 },
    ],
  },
  {
    id: 'demo-t6',
    baseId: 'retro-tech',
    subject: 'Mechanical keyboard switches for terminal work — MX Blue vs buckling spring?',
    posts: [
      { author: 'KeyboardKult', body: 'Model M buckling spring every time. The tactile click is feedback, not noise. My fingers know when a character registered before my eyes do.', ts: Date.now() - 86400000 * 12 },
      { author: 'RetroRonin',   body: 'MX Blues for the clickiness without the murder-weight. Though I admit the Model M sounds like a proper machine.', ts: Date.now() - 86400000 * 11 },
    ],
  },
];

const GHOST_CALLERS = ['WitchHazel', 'GhostBuster9', 'CarvingKing', 'NightOwlSysOp', 'RetroRonin'];

const SYSOP_REPLIES = [
  'Howdy, Caller! Glad you connected. Node 1 is all yours tonight — spooky season is peak BBS season.',
  'Ha! That\'s a question I haven\'t gotten in years. Let me check the SYSOP.LOG... *clicks keys* ...interesting.',
  'Been running this board since \'91. Halloween sub-board gets the most traffic every October without fail.',
  'If you dig retro tech, the Retro Tech base has some great threads. Old iron never truly dies.',
  'The Commodore 64 crowd keep asking for a C64 sub-board. Maybe after I upgrade the hard card.',
  'Check the Halloween base — WitchHazel just posted something unsettling about midnight scratching.',
  'Roger that, Caller. Type /quit to get back to the main menu whenever you\'re done chatting.',
  'Gotta love that 2400 baud screech. Music to my ears.',
  'Try pressing Z on a thread for a quick SysOp summary. No AI required — I write them myself.',
  'The Haunting (1963) is peak horror. You should check the movie thread in the Halloween base.',
];

const BAD_PHRASES = ['spam', 'buy now', 'click here', 'free money', 'wire transfer'];

// ── LocalStorage helpers ──────────────────────────────────────────────────────

const LS_KEY = 'nightowl_demo_db';

function loadDb() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  // First run: seed the database
  const db = {
    callers: {},
    threads: SEED_THREADS.map(t => ({
      ...t,
      posts: t.posts.map(p => ({ ...p })),
    })),
  };
  saveDb(db);
  return db;
}

function saveDb(db) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(db)); } catch { /* ignore */ }
}

function uuid() {
  return 'demo-' + Math.random().toString(36).slice(2, 11) + '-' + Date.now().toString(36);
}

// ── Validation (mirrors server/index.js) ─────────────────────────────────────

const HANDLE_RE = /^[A-Za-z0-9_]{3,16}$/;

// ── Simulated who's-online ────────────────────────────────────────────────────
// Ghost callers "arrive" and "leave" randomly to keep the online list alive.

let _ghostInterval = null;
const _onlineListeners = new Set();

function _startGhosts() {
  if (_ghostInterval) return;
  // Seed: 2–3 ghosts online immediately
  const db = loadDb();
  const now = Date.now();
  const picks = [...GHOST_CALLERS].sort(() => Math.random() - 0.5).slice(0, 3);
  picks.forEach(h => { db.callers[h] = { calls: Math.ceil(Math.random() * 20 + 1), lastSeen: now - Math.floor(Math.random() * 120000) }; });
  saveDb(db);

  // Every 15 s: randomly touch or drop a ghost
  _ghostInterval = setInterval(() => {
    const db2 = loadDb();
    const ghost = GHOST_CALLERS[Math.floor(Math.random() * GHOST_CALLERS.length)];
    if (Math.random() < 0.6) {
      db2.callers[ghost] = { calls: (db2.callers[ghost]?.calls ?? 0) + 1, lastSeen: Date.now() };
    }
    saveDb(db2);
    const online = _getOnlineCallers(db2);
    _onlineListeners.forEach(cb => cb(online));
  }, 15000);
}

function _getOnlineCallers(db) {
  const cutoff = Date.now() - 5 * 60 * 1000;
  return Object.entries(db.callers)
    .filter(([, v]) => v.lastSeen >= cutoff)
    .map(([handle, v]) => ({ handle, lastSeen: v.lastSeen }));
}

// ── SSE shim ──────────────────────────────────────────────────────────────────
// Returns a fake EventSource-like object that fires 'online' events via polling.

function makeDemoEventSource() {
  const listeners = {};
  const es = {
    addEventListener(type, fn) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (listeners[type]) listeners[type] = listeners[type].filter(f => f !== fn);
    },
    close() { _onlineListeners.delete(dispatch); },
  };

  function dispatch(online) {
    (listeners['online'] || []).forEach(fn => fn({ data: JSON.stringify(online) }));
  }
  _onlineListeners.add(dispatch);

  // Fire initial online list after a short delay (terminal.js may not have
  // registered listeners yet if this runs synchronously)
  setTimeout(() => {
    const db = loadDb();
    dispatch(_getOnlineCallers(db));
  }, 500);

  return es;
}

// ── API handlers ──────────────────────────────────────────────────────────────

function apiLogin(body) {
  const { handle } = body;
  if (!handle || !HANDLE_RE.test(handle)) {
    return { error: 'Invalid handle. Use 3-16 chars: A-Z a-z 0-9 _' };
  }
  const db = loadDb();
  const existing = db.callers[handle];
  const caller = existing
    ? { ...existing, calls: existing.calls + 1, lastSeen: Date.now() }
    : { calls: 1, lastSeen: Date.now() };
  db.callers[handle] = caller;
  saveDb(db);
  // Notify online listeners
  _onlineListeners.forEach(cb => cb(_getOnlineCallers(db)));
  return { handle, calls: caller.calls, firstCall: caller.calls === 1 };
}

function apiBases() {
  return SEED_BASES;
}

function apiGetThreads(baseId, page) {
  const PAGE_SIZE = 15;
  const p = Math.max(1, parseInt(page) || 1);
  const db = loadDb();
  const all = db.threads
    .filter(t => t.baseId === baseId)
    .sort((a, b) => b.posts[0].ts - a.posts[0].ts);
  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const threads = all.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  return { threads, page: p, pages, total };
}

function apiGetThread(threadId) {
  const db = loadDb();
  const thread = db.threads.find(t => t.id === threadId);
  return thread || { error: 'Thread not found' };
}

function apiCreateThread(baseId, body) {
  const { subject, author, body: postBody } = body;
  if (!subject || !author || !postBody) return { error: 'subject, author, and body required' };
  if (!HANDLE_RE.test(author)) return { error: 'Invalid author handle' };
  const db = loadDb();
  const lower = postBody.toLowerCase();
  const held = BAD_PHRASES.some(w => lower.includes(w));
  const thread = {
    id: uuid(),
    baseId,
    subject: subject.slice(0, 120),
    posts: [{
      author,
      body: postBody.slice(0, 2000),
      ts: Date.now(),
      ...(held ? { held: true, reason: 'Contains suspicious phrase' } : {}),
    }],
  };
  db.threads.push(thread);
  saveDb(db);
  return thread;
}

function apiCreateReply(threadId, body) {
  const { author, body: postBody } = body;
  if (!author || !postBody) return { error: 'author and body required' };
  if (!HANDLE_RE.test(author)) return { error: 'Invalid author handle' };
  const db = loadDb();
  const thread = db.threads.find(t => t.id === threadId);
  if (!thread) return { error: 'Thread not found' };
  const lower = postBody.toLowerCase();
  const held = BAD_PHRASES.some(w => lower.includes(w));
  const post = {
    author,
    body: postBody.slice(0, 2000),
    ts: Date.now(),
    ...(held ? { held: true, reason: 'Contains suspicious phrase' } : {}),
  };
  thread.posts.push(post);
  saveDb(db);
  return post;
}

function apiSysopChat(body) {
  const msg = (body.message || '').toLowerCase();
  let reply;
  if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
    reply = 'Welcome to NightOwl BBS demo! You\'re running fully client-side off localStorage. No server required — spooky, right?';
  } else if (msg.includes('help') || msg.includes('how')) {
    reply = 'Use the main menu keys: M=Messages, W=Who\'s online, B=Bulletins, G=Goodbye. Press Z in a thread for a summary.';
  } else if (msg.includes('demo') || msg.includes('github') || msg.includes('pages')) {
    reply = 'Yep, you\'re in demo mode! Everything runs in your browser via localStorage. The real board needs Node.js — see the README.';
  } else if (msg.includes('halloween') || msg.includes('spook') || msg.includes('ghost') || msg.includes('scar')) {
    reply = 'Oh, the Halloween base is 🎃 LIT 🎃 right now. WitchHazel posted something unsettling about midnight scratching. Worth a read.';
  } else if (msg.includes('retro') || msg.includes('486') || msg.includes('amiga') || msg.includes('dos')) {
    reply = 'Retro Tech is my favourite sub-board. We\'ve got folks still running 486s and Amigas in 2026. Old iron never dies.';
  } else {
    reply = SYSOP_REPLIES[Math.floor(Math.random() * SYSOP_REPLIES.length)];
  }
  return { reply };
}

function apiSummary(threadId) {
  const db = loadDb();
  const thread = db.threads.find(t => t.id === threadId);
  if (!thread) return { summary: 'Thread not found.' };
  const visible = thread.posts.filter(p => !p.held);
  const count = visible.length;
  const authors = [...new Set(visible.map(p => p.author))];
  const summary = [
    `Thread: "${thread.subject.slice(0, 60)}"`,
    `${count} post${count !== 1 ? 's' : ''} from: ${authors.slice(0, 3).join(', ')}`,
    `Latest: ${new Date(visible.at(-1)?.ts ?? Date.now()).toLocaleDateString()}`,
    `— SysOp summary (demo mode)`,
  ].join('\n');
  return { summary };
}

// ── Route dispatcher ──────────────────────────────────────────────────────────
// Called by the patched api() in terminal.js instead of fetch().

function demoApi(method, path, body) {
  // Strip any leading base path (e.g. /nightowl-bbs/api/login → /api/login)
  const p = path.replace(/^.*?(\/api\/)/, '/api/');

  // POST /api/login
  if (method === 'POST' && p === '/api/login') return apiLogin(body);
  // GET /api/bases
  if (method === 'GET'  && p === '/api/bases') return apiBases();
  // GET /api/bases/:id/threads
  const threadsM = p.match(/^\/api\/bases\/([^/]+)\/threads/);
  if (method === 'GET' && threadsM) {
    const qs = p.split('?')[1] || '';
    const page = new URLSearchParams(qs).get('page') || 1;
    return apiGetThreads(threadsM[1], page);
  }
  // POST /api/bases/:id/threads
  const newThreadM = p.match(/^\/api\/bases\/([^/]+)\/threads$/);
  if (method === 'POST' && newThreadM) return apiCreateThread(newThreadM[1], body);
  // GET /api/threads/:id
  const threadM = p.match(/^\/api\/threads\/([^/]+)$/);
  if (method === 'GET' && threadM) return apiGetThread(threadM[1]);
  // POST /api/threads/:id/replies
  const replyM = p.match(/^\/api\/threads\/([^/]+)\/replies$/);
  if (method === 'POST' && replyM) return apiCreateReply(replyM[1], body);
  // POST /api/sysop/chat
  if (method === 'POST' && p === '/api/sysop/chat') return apiSysopChat(body);
  // GET /api/threads/:id/summary
  const summaryM = p.match(/^\/api\/threads\/([^/]+)\/summary$/);
  if (method === 'GET' && summaryM) return apiSummary(summaryM[1]);

  return { error: `Demo: unknown route ${method} ${path}` };
}

// ── Exports on window ─────────────────────────────────────────────────────────
// terminal.js probes the server on boot; if unreachable it sets
// window.__demoMode = true and calls window.__demoActivate() to seed ghosts.

window.__demoApi = demoApi;
window.__makeDemoEventSource = makeDemoEventSource;
window.__demoActivate = _startGhosts;

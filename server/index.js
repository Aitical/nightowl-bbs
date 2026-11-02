/**
 * index.js — NightOwl BBS Express server
 * Routes: login, bases, threads, posts, sysop, SSE events.
 */
import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  loginCaller, getOnlineCallers, touchCaller,
  getBases, getThreads, getThread, createThread, createReply, holdPost
} from './store.js';
import { ansiToHtml } from './ansi.js';
import { chat, moderate, summarize } from './sysop.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(join(__dirname, '..', 'public')));

// SSE clients
const sseClients = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch { sseClients.delete(res); }
  }
}

// Keep-alive heartbeat
setInterval(() => {
  const payload = ':heartbeat\n\n';
  for (const res of sseClients) {
    try { res.write(payload); } catch { sseClients.delete(res); }
  }
}, 20000);

// ── Auth helper ───────────────────────────────────────────────────────────────

const HANDLE_RE = /^[A-Za-z0-9_]{3,16}$/;

function validateHandle(handle) {
  return HANDLE_RE.test(handle);
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/login
app.post('/api/login', (req, res) => {
  const { handle } = req.body;
  if (!handle || !validateHandle(handle)) {
    return res.status(400).json({
      error: ansiToHtml('\x1b[31mInvalid handle. Use 3-16 chars: A-Z a-z 0-9 _\x1b[0m')
    });
  }
  const caller = loginCaller(handle);
  broadcast('online', getOnlineCallers());
  res.json({ handle, calls: caller.calls, firstCall: caller.calls === 1 });
});

// GET /api/bases
app.get('/api/bases', (req, res) => {
  res.json(getBases());
});

// GET /api/bases/:id/threads
app.get('/api/bases/:id/threads', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const result = getThreads(req.params.id, page);
  res.json(result);
});

// GET /api/threads/:id
app.get('/api/threads/:id', (req, res) => {
  const thread = getThread(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });
  res.json(thread);
});

// POST /api/bases/:id/threads
app.post('/api/bases/:id/threads', async (req, res) => {
  const { subject, author, body } = req.body;
  if (!subject || !author || !body) {
    return res.status(400).json({ error: 'subject, author, and body required' });
  }
  if (!validateHandle(author)) {
    return res.status(400).json({ error: 'Invalid author handle' });
  }
  const thread = createThread(req.params.id, subject, author, body);
  touchCaller(author);

  // Moderation
  const verdict = await moderate(author, body);
  if (verdict.hold) {
    holdPost(thread.id, 0, verdict.reason);
    thread.posts[0].held = true;
    thread.posts[0].reason = verdict.reason;
  }

  broadcast('newthread', {
    baseId: req.params.id,
    threadId: thread.id,
    subject: thread.subject,
    author
  });
  res.status(201).json(thread);
});

// POST /api/threads/:id/replies
app.post('/api/threads/:id/replies', async (req, res) => {
  const { author, body } = req.body;
  if (!author || !body) {
    return res.status(400).json({ error: 'author and body required' });
  }
  if (!validateHandle(author)) {
    return res.status(400).json({ error: 'Invalid author handle' });
  }
  let post;
  try {
    post = createReply(req.params.id, author, body);
    touchCaller(author);
  } catch (e) {
    return res.status(404).json({ error: e.message });
  }

  // Moderation
  const thread = getThread(req.params.id);
  const postIdx = thread.posts.length - 1;
  const verdict = await moderate(author, body);
  if (verdict.hold) {
    holdPost(req.params.id, postIdx, verdict.reason);
    post.held = true;
    post.reason = verdict.reason;
  }

  broadcast('newpost', { threadId: req.params.id, author });
  res.status(201).json(post);
});

// POST /api/sysop/chat
app.post('/api/sysop/chat', async (req, res) => {
  const { message, handle } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  const reply = await chat(message, handle);
  res.json({ reply });
});

// GET /api/threads/:id/summary
app.get('/api/threads/:id/summary', async (req, res) => {
  const thread = getThread(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });
  const text = await summarize(thread);
  res.json({ summary: text });
});

// GET /api/events (SSE)
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  sseClients.add(res);

  // Send current online list immediately
  res.write(`event: online\ndata: ${JSON.stringify(getOnlineCallers())}\n\n`);

  req.on('close', () => sseClients.delete(res));
});

app.listen(PORT, () => {
  console.log(`NightOwl BBS running on http://localhost:${PORT}`);
});

export { app };

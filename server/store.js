/**
 * store.js — atomic JSON persistence for NightOwl BBS
 * Keeps all state in data/db.json; writes are atomic via temp-file rename.
 */
import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'data', 'db.json');
const TMP_PATH = DB_PATH + '.tmp';

const SEED = {
  callers: {},
  bases: [
    { id: 'general', name: 'General', description: 'Shoot the breeze' },
    { id: 'retro-tech', name: 'Retro Tech', description: 'Old iron never dies' },
    { id: 'halloween', name: 'Halloween', description: 'Tricks, treats & terror' }
  ],
  threads: []
};

function load() {
  if (!existsSync(DB_PATH)) return structuredClone(SEED);
  try {
    return JSON.parse(readFileSync(DB_PATH, 'utf8'));
  } catch {
    return structuredClone(SEED);
  }
}

function save(db) {
  writeFileSync(TMP_PATH, JSON.stringify(db, null, 2));
  renameSync(TMP_PATH, DB_PATH);
}

// ── callers ──────────────────────────────────────────────────────────────────

export function loginCaller(handle) {
  const db = load();
  const existing = db.callers[handle];
  const caller = existing
    ? { ...existing, calls: existing.calls + 1, lastSeen: Date.now() }
    : { calls: 1, lastSeen: Date.now() };
  db.callers[handle] = caller;
  save(db);
  return caller;
}

export function getOnlineCallers(windowMs = 5 * 60 * 1000) {
  const db = load();
  const cutoff = Date.now() - windowMs;
  return Object.entries(db.callers)
    .filter(([, v]) => v.lastSeen >= cutoff)
    .map(([handle, v]) => ({ handle, lastSeen: v.lastSeen }));
}

export function touchCaller(handle) {
  const db = load();
  if (db.callers[handle]) {
    db.callers[handle].lastSeen = Date.now();
    save(db);
  }
}

// ── bases ─────────────────────────────────────────────────────────────────────

export function getBases() {
  return load().bases;
}

// ── threads ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 15;

export function getThreads(baseId, page = 1) {
  const db = load();
  const all = db.threads
    .filter(t => t.baseId === baseId)
    .sort((a, b) => b.posts[0].ts - a.posts[0].ts);
  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const slice = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return { threads: slice, page, pages, total };
}

export function getThread(threadId) {
  const db = load();
  return db.threads.find(t => t.id === threadId) || null;
}

export function createThread(baseId, subject, author, body) {
  const db = load();
  const thread = {
    id: randomUUID(),
    baseId,
    subject: subject.slice(0, 120),
    posts: [{ author, body: body.slice(0, 2000), ts: Date.now() }]
  };
  db.threads.push(thread);
  save(db);
  return thread;
}

export function createReply(threadId, author, body) {
  const db = load();
  const thread = db.threads.find(t => t.id === threadId);
  if (!thread) throw new Error('Thread not found');
  const post = { author, body: body.slice(0, 2000), ts: Date.now() };
  thread.posts.push(post);
  save(db);
  return post;
}

export function holdPost(threadId, postIndex, reason) {
  const db = load();
  const thread = db.threads.find(t => t.id === threadId);
  if (!thread || !thread.posts[postIndex]) return;
  thread.posts[postIndex].held = true;
  thread.posts[postIndex].reason = reason;
  save(db);
}

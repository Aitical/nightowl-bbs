/**
 * store.test.js — property-based + unit tests for the message store
 *
 * Isolation strategy:
 *  - DB_PATH is set via env before the store module is first imported.
 *  - beforeEach removes and recreates the data-test directory so each leaf
 *    test starts with a completely empty database.
 *  - The outer describe runs with concurrency:1 so beforeEach/afterEach
 *    cannot interleave across parallel tests on the same file.
 *  - A module-level rm also clears any leftover data-test from a prior run.
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testDataDir = join(__dirname, '..', 'data-test');

// ── Module-level cleanup: remove any leftover dir from a prior run ────────────
if (existsSync(testDataDir)) {
  rmSync(testDataDir, { recursive: true, force: true });
}
mkdirSync(testDataDir, { recursive: true });

// ── DB_PATH must be set BEFORE the store module is imported ──────────────────
process.env.DB_PATH = join(testDataDir, 'db.json');

import {
  loginCaller, getOnlineCallers, getBases,
  getThreads, getThread, createThread, createReply, holdPost
} from '../server/store.js';

// Helper: completely reset the database between tests
function resetDb() {
  if (existsSync(testDataDir)) {
    rmSync(testDataDir, { recursive: true, force: true });
  }
  mkdirSync(testDataDir, { recursive: true });
}

// concurrency:1 ensures no two leaf tests run in parallel within this file,
// so beforeEach/afterEach never race on the shared db file.
describe('Store', { concurrency: 1 }, () => {
  beforeEach(() => resetDb());
  afterEach(() => resetDb());

  describe('loginCaller', () => {
    test('creates new caller on first login', () => {
      const result = loginCaller('TestUser');
      assert.equal(result.calls, 1);
      assert.ok(result.lastSeen > 0);
    });

    test('increments call count on subsequent logins', () => {
      loginCaller('TestUser');
      loginCaller('TestUser');
      const result = loginCaller('TestUser');
      assert.equal(result.calls, 3);
    });
  });

  describe('getOnlineCallers', () => {
    test('returns callers seen within window', () => {
      loginCaller('Alice');
      loginCaller('Bob');
      const online = getOnlineCallers(5 * 60 * 1000);
      assert.ok(online.length >= 2);
      const handles = online.map(c => c.handle);
      assert.ok(handles.includes('Alice'));
      assert.ok(handles.includes('Bob'));
    });

    test('excludes callers outside window', () => {
      loginCaller('OldCaller');
      // With 0ms window, no one should be online
      const online = getOnlineCallers(0);
      assert.equal(online.length, 0);
    });
  });

  describe('getBases', () => {
    test('returns at least 3 bases', () => {
      const bases = getBases();
      assert.ok(bases.length >= 3);
    });

    test('each base has id, name, description', () => {
      const bases = getBases();
      for (const b of bases) {
        assert.ok(b.id);
        assert.ok(b.name);
        assert.ok(b.description);
      }
    });
  });

  describe('createThread / getThread', () => {
    test('creates thread with correct fields', () => {
      const t = createThread('general', 'Hello World', 'Alice', 'First post!');
      assert.ok(t.id);
      assert.equal(t.baseId, 'general');
      assert.equal(t.subject, 'Hello World');
      assert.equal(t.posts.length, 1);
      assert.equal(t.posts[0].author, 'Alice');
      assert.equal(t.posts[0].body, 'First post!');
      assert.ok(t.posts[0].ts > 0);
    });

    test('retrieves thread by id', () => {
      const created = createThread('general', 'Test', 'Alice', 'Body');
      const found = getThread(created.id);
      assert.equal(found.id, created.id);
    });

    test('returns null for unknown thread id', () => {
      const result = getThread('00000000-0000-0000-0000-000000000000');
      assert.equal(result, null);
    });

    test('truncates body to 2000 chars', () => {
      const longBody = 'x'.repeat(3000);
      const t = createThread('general', 'Subject', 'Alice', longBody);
      assert.equal(t.posts[0].body.length, 2000);
    });
  });

  describe('getThreads', () => {
    test('returns empty page for empty base', () => {
      const result = getThreads('general', 1);
      assert.equal(result.threads.length, 0);
      assert.equal(result.page, 1);
    });

    test('paginates correctly', () => {
      for (let i = 0; i < 20; i++) {
        createThread('general', `Thread ${i}`, 'Alice', 'Body');
      }
      const p1 = getThreads('general', 1);
      assert.equal(p1.threads.length, 15);
      assert.equal(p1.pages, 2);
      const p2 = getThreads('general', 2);
      assert.equal(p2.threads.length, 5);
    });
  });

  describe('createReply', () => {
    test('adds reply to thread', () => {
      const t = createThread('general', 'Subject', 'Alice', 'Original');
      const reply = createReply(t.id, 'Bob', 'Reply body');
      assert.equal(reply.author, 'Bob');
      const updated = getThread(t.id);
      assert.equal(updated.posts.length, 2);
    });

    test('throws for nonexistent thread', () => {
      assert.throws(
        () => createReply('bad-id', 'Alice', 'Body'),
        /Thread not found/
      );
    });
  });

  describe('holdPost', () => {
    test('marks post as held with reason', () => {
      const t = createThread('general', 'Subject', 'Alice', 'Body');
      holdPost(t.id, 0, 'Spam detected');
      const updated = getThread(t.id);
      assert.equal(updated.posts[0].held, true);
      assert.equal(updated.posts[0].reason, 'Spam detected');
    });
  });

  describe('Property-based tests', () => {
    test('login + getOnlineCallers: handle always present', () => {
      fc.assert(fc.property(
        fc.stringMatching(/^[A-Za-z0-9_]{3,16}$/),
        (handle) => {
          loginCaller(handle);
          const online = getOnlineCallers(5 * 60 * 1000);
          const handles = online.map(c => c.handle);
          assert.ok(handles.includes(handle));
        }
      ));
    });

    test('createThread subject always truncated to ≤120 chars', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        (subject, author, body) => {
          const safeAuthor = 'User' + Math.abs(author.charCodeAt(0) || 65) % 1000;
          const t = createThread('general', subject, safeAuthor, body);
          assert.ok(t.subject.length <= 120);
        }
      ));
    });

    test('createThread body always truncated to ≤2000 chars', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1, maxLength: 5000 }),
        (body) => {
          const t = createThread('general', 'Subj', 'Alice', body);
          assert.ok(t.posts[0].body.length <= 2000);
        }
      ));
    });
  });
});

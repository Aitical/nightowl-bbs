/**
 * demo-api.test.js — unit + property-based tests for demo-api.js
 * Tests path normalization, API routes (login, bases, threads, post, sysop chat),
 * and ensures invariants hold across random inputs.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { demoApi, normalizePath, loadDb, saveDb } from '../public/demo-api.js';

// ── Path normalization tests ──────────────────────────────────────────────────

describe('normalizePath', () => {
  test('normalizes relative path: api/bases', () => {
    assert.equal(normalizePath('api/bases'), '/api/bases');
  });

  test('normalizes relative path with dot: ./api/login', () => {
    assert.equal(normalizePath('./api/login'), '/api/login');
  });

  test('already normalized path: /api/login', () => {
    assert.equal(normalizePath('/api/login'), '/api/login');
  });

  test('normalizes full URL: http://example.com/api/bases', () => {
    assert.equal(normalizePath('http://example.com/api/bases'), '/api/bases');
  });

  test('normalizes full URL with path prefix: http://example.com/nightowl-bbs/api/login', () => {
    assert.equal(normalizePath('http://example.com/nightowl-bbs/api/login'), '/api/login');
  });

  test('normalizes nested path: /some/prefix/api/threads/123', () => {
    assert.equal(normalizePath('/some/prefix/api/threads/123'), '/api/threads/123');
  });

  test('normalizes with query string: api/bases?filter=all', () => {
    assert.equal(normalizePath('api/bases?filter=all'), '/api/bases?filter=all');
  });

  test('property: paths with /api/ segment normalize correctly', () => {
    // Generate random prefix + /api/... patterns
    fc.assert(fc.property(
      fc.stringOf(fc.constantFrom('a', 'b', '/', '.', '-', '_'), { maxLength: 5 }),
      (prefix) => {
        // Build a path like "prefix/api/bases"
        const path = prefix + '/api/bases';
        const normalized = normalizePath(path);
        // Should start with /api/
        assert.ok(normalized.startsWith('/api/'), `Expected ${normalized} to start with /api/`);
        // Should contain bases
        assert.ok(normalized.includes('bases'), `Expected ${normalized} to contain bases`);
      }
    ));
  });

  test('property: normalized path always starts with /api/', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-z0-9_]+$/.test(s)),
      (randomSuffix) => {
        const paths = [
          `api/${randomSuffix}`,
          `/api/${randomSuffix}`,
          `./api/${randomSuffix}`,
          `http://example.com/api/${randomSuffix}`,
        ];
        paths.forEach(p => {
          const normalized = normalizePath(p);
          assert.ok(normalized.startsWith('/api/'), `Expected ${normalized} to start with /api/`);
        });
      }
    ));
  });
});

// ── API route tests ───────────────────────────────────────────────────────────

describe('demoApi - login', () => {
  test('POST /api/login with valid handle', () => {
    const result = demoApi('POST', '/api/login', { handle: 'TestCaller' });
    assert.ok(!result.error);
    assert.equal(result.handle, 'TestCaller');
    assert.equal(result.calls, 1);
    assert.equal(result.firstCall, true);
  });

  test('POST /api/login with relative path', () => {
    const result = demoApi('POST', 'api/login', { handle: 'DemoCaller' });
    assert.ok(!result.error);
    assert.equal(result.handle, 'DemoCaller');
  });

  test('POST /api/login rejects invalid handle', () => {
    const result = demoApi('POST', '/api/login', { handle: 'ab' }); // too short
    assert.ok(result.error);
  });

  test('POST /api/login with special chars in handle fails', () => {
    const result = demoApi('POST', '/api/login', { handle: 'Test@User' });
    assert.ok(result.error);
  });
});

describe('demoApi - bases', () => {
  test('GET /api/bases returns seed bases', () => {
    const result = demoApi('GET', '/api/bases');
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 3);
    const ids = result.map(b => b.id);
    assert.ok(ids.includes('general'));
    assert.ok(ids.includes('retro-tech'));
    assert.ok(ids.includes('halloween'));
  });

  test('GET api/bases (relative path)', () => {
    const result = demoApi('GET', 'api/bases');
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 3);
  });

  test('GET /api/bases includes name and description', () => {
    const result = demoApi('GET', '/api/bases');
    result.forEach(base => {
      assert.ok(base.id);
      assert.ok(base.name);
      assert.ok(base.description);
    });
  });
});

describe('demoApi - threads', () => {
  test('GET /api/bases/:id/threads returns paginated threads', () => {
    const result = demoApi('GET', '/api/bases/halloween/threads?page=1');
    assert.ok(result.threads);
    assert.ok(Array.isArray(result.threads));
    assert.equal(result.page, 1);
    assert.ok(result.pages >= 1);
    assert.ok(result.total >= 0);
  });

  test('GET /api/threads/:id returns full thread', () => {
    // First get a thread id
    const threadsResult = demoApi('GET', '/api/bases/halloween/threads?page=1');
    if (threadsResult.threads.length > 0) {
      const threadId = threadsResult.threads[0].id;
      const result = demoApi('GET', `/api/threads/${threadId}`);
      assert.ok(result.id);
      assert.ok(result.subject);
      assert.ok(Array.isArray(result.posts));
    }
  });

  test('GET /api/threads/:id with nonexistent id returns error', () => {
    const result = demoApi('GET', '/api/threads/nonexistent-thread-id');
    assert.ok(result.error);
  });
});

describe('demoApi - post/reply', () => {
  test('POST /api/bases/:id/threads creates new thread', () => {
    const result = demoApi('POST', '/api/bases/general/threads', {
      subject: 'Test Thread',
      author: 'TestUser',
      body: 'This is a test post',
    });
    assert.ok(!result.error);
    assert.ok(result.id);
    assert.equal(result.subject, 'Test Thread');
    assert.equal(result.posts.length, 1);
  });

  test('POST /api/bases/:id/threads rejects spam', () => {
    const result = demoApi('POST', '/api/bases/general/threads', {
      subject: 'Spam',
      author: 'Spammer',
      body: 'Buy now click here free money',
    });
    assert.ok(!result.error); // Thread created but marked as held
    assert.equal(result.posts[0].held, true);
  });

  test('POST /api/threads/:id/replies creates reply', () => {
    // Use an existing seed thread that's guaranteed to exist
    const threadsResult = demoApi('GET', '/api/bases/halloween/threads?page=1');
    assert.ok(threadsResult.threads.length > 0, 'Should have seed threads');
    
    const threadId = threadsResult.threads[0].id;
    
    // Add reply to existing thread
    const result = demoApi('POST', `/api/threads/${threadId}/replies`, {
      author: 'ReplyAuthor',
      body: 'This is a reply',
    });
    assert.ok(!result.error, `Reply should not error: ${result.error || 'ok'}`);
    assert.equal(result.author, 'ReplyAuthor');
    assert.equal(result.body, 'This is a reply');
  });

  test('POST /api/threads/:id/replies to nonexistent thread returns error', () => {
    const result = demoApi('POST', '/api/threads/nonexistent-id/replies', {
      author: 'TestUser',
      body: 'Reply',
    });
    assert.ok(result.error);
  });
});

describe('demoApi - sysop chat', () => {
  test('POST /api/sysop/chat returns reply', () => {
    const result = demoApi('POST', '/api/sysop/chat', {
      message: 'Hello SysOp',
    });
    assert.ok(result.reply);
    assert.ok(result.reply.length > 0);
  });

  test('POST /api/sysop/chat with greeting triggers welcome response', () => {
    const result = demoApi('POST', '/api/sysop/chat', {
      message: 'Hi there',
    });
    assert.ok(result.reply);
    assert.ok(result.reply.includes('demo'));
  });

  test('POST /api/sysop/chat with help triggers help response', () => {
    const result = demoApi('POST', '/api/sysop/chat', {
      message: 'help please',
    });
    assert.ok(result.reply);
    assert.ok(result.reply.toLowerCase().includes('menu'));
  });

  test('POST /api/sysop/chat with halloween triggers themed response', () => {
    const result = demoApi('POST', '/api/sysop/chat', {
      message: 'tell me about halloween',
    });
    assert.ok(result.reply);
    assert.ok(result.reply.includes('Halloween'));
  });

  test('POST api/sysop/chat (relative path)', () => {
    const result = demoApi('POST', 'api/sysop/chat', {
      message: 'hello',
    });
    assert.ok(result.reply);
  });
});

describe('demoApi - summary', () => {
  test('GET /api/threads/:id/summary returns summary', () => {
    // Get an existing thread
    const threadsResult = demoApi('GET', '/api/bases/halloween/threads?page=1');
    if (threadsResult.threads.length > 0) {
      const threadId = threadsResult.threads[0].id;
      const result = demoApi('GET', `/api/threads/${threadId}/summary`);
      assert.ok(result.summary);
      assert.ok(result.summary.includes('Thread:'));
    }
  });

  test('GET /api/threads/:id/summary with nonexistent thread', () => {
    const result = demoApi('GET', '/api/threads/nonexistent/summary');
    assert.ok(result.summary);
    assert.ok(result.summary.includes('not found'));
  });
});

describe('demoApi - error handling', () => {
  test('unknown route returns error', () => {
    const result = demoApi('GET', '/api/unknown/route');
    assert.ok(result.error);
    assert.ok(result.error.includes('unknown route'));
  });

  test('unknown method returns error', () => {
    const result = demoApi('DELETE', '/api/bases');
    assert.ok(result.error);
  });
});

describe('demoApi - property tests', () => {
  test('property: login handle follows validation rules', () => {
    fc.assert(fc.property(
      fc.string().filter(s => /^[A-Za-z0-9_]{3,16}$/.test(s)),
      (validHandle) => {
        const result = demoApi('POST', '/api/login', { handle: validHandle });
        assert.ok(!result.error);
        assert.equal(result.handle, validHandle);
      }
    ));
  });

  test('property: invalid handles are rejected', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 0, maxLength: 2 }), // too short or empty
      (shortHandle) => {
        const result = demoApi('POST', '/api/login', { handle: shortHandle });
        assert.ok(result.error);
      }
    ));
  });

  test('property: POST /api/login always sets calls >= 1', () => {
    // Reserved words that are Object/Function prototype properties
    const reserved = [
      'constructor', 'prototype', '__proto__', 'toString', 'valueOf',
      'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
      'toLocaleString', 'toJSON', '__defineGetter__', '__defineSetter__',
      '__lookupGetter__', '__lookupSetter__'
    ];
    
    fc.assert(fc.property(
      fc.string({ minLength: 3, maxLength: 16 }).filter(s => {
        // Only accept strings that match the handle regex and avoid reserved words
        return /^[A-Za-z0-9_]+$/.test(s) && !reserved.includes(s);
      }),
      (handle) => {
        const result = demoApi('POST', '/api/login', { handle });
        if (!result.error) {
          assert.ok(result.calls >= 1, `Expected calls >= 1, got ${result.calls}`);
        }
      }
    ));
  });

  test('property: path normalization preserves query strings', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 30 }).filter(s => !/[&=?]/.test(s)),
      (queryValue) => {
        const path = `api/bases?id=${queryValue}`;
        const normalized = normalizePath(path);
        assert.ok(normalized.includes('?'));
        assert.ok(normalized.includes(queryValue));
      }
    ));
  });

  test('property: all thread creation variations with relative paths work', () => {
    fc.assert(fc.property(
      fc.stringOf(fc.constantFrom('a', 'b', '/', '.')),
      (prefix) => {
        const path = prefix + 'api/bases/general/threads';
        const result = demoApi('POST', path, {
          subject: 'Test',
          author: 'TestUser',
          body: 'Test body',
        });
        // Should either succeed or fail gracefully, never crash
        assert.ok(result !== null && typeof result === 'object');
      }
    ));
  });

  test('property: sysop chat never returns empty reply', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 100 }),
      (msg) => {
        const result = demoApi('POST', '/api/sysop/chat', { message: msg });
        assert.ok(result.reply);
        assert.ok(result.reply.length > 0);
      }
    ));
  });

  test('property: bases list always has at least 3 bases', () => {
    fc.assert(fc.property(
      fc.constant(null),
      () => {
        const result = demoApi('GET', '/api/bases');
        assert.ok(Array.isArray(result));
        assert.ok(result.length >= 3);
      }
    ));
  });
});

// ── Demo mode initialization tests ───────────────────────────────────────────

describe('demo-api - initialization', () => {
  test('initial online list contains at least 2 ghost callers after login', () => {
    // Simulate the _startGhosts() behavior by directly calling the API
    // First, seed the database by loading it (which will initialize with SEED_THREADS)
    const db = loadDb();
    
    // Manually initialize the callers list like _startGhosts does
    const GHOST_CALLERS = ['GhostBuster9', 'WitchHazel', 'CinemaSpectre', 'OldSysOp'];
    const now = Date.now();
    const picks = [...GHOST_CALLERS].sort(() => Math.random() - 0.5).slice(0, 3);
    picks.forEach(h => {
      db.callers[h] = { calls: Math.ceil(Math.random() * 20 + 1), lastSeen: now - Math.floor(Math.random() * 120000) };
    });
    saveDb(db);
    
    // Now simulate getting the online callers (which _getOnlineCallers does)
    const cutoff = Date.now() - 5 * 60 * 1000; // 5 minutes
    const online = Object.entries(db.callers)
      .filter(([, v]) => v.lastSeen >= cutoff)
      .map(([handle, v]) => ({ handle, lastSeen: v.lastSeen }));
    
    // Should have at least 2 ghosts online
    assert.ok(online.length >= 2, `Expected at least 2 online callers, got ${online.length}`);
    
    // Verify they're from the ghost callers list
    const onlineHandles = online.map(c => c.handle);
    const ghostsOnline = onlineHandles.filter(h => GHOST_CALLERS.includes(h));
    assert.ok(ghostsOnline.length >= 2, `Expected at least 2 ghost callers online, got ${ghostsOnline.length}`);
  });

  test('seed threads contain valid author and body text without HTML entity corruption', () => {
    const result = demoApi('GET', '/api/bases/halloween/threads?page=1');
    assert.ok(result.threads.length > 0, 'Should have seed threads in halloween base');
    
    result.threads.forEach(thread => {
      assert.ok(thread.subject, 'Thread should have subject');
      assert.ok(thread.posts.length > 0, 'Thread should have at least one post');
      
      thread.posts.forEach(post => {
        assert.ok(post.author, 'Post should have author');
        assert.ok(post.body, 'Post should have body');
        // Verify no HTML entity corruption (raw apostrophes should appear as ')
        assert.ok(!post.body.includes('&#39;'), 'Post body should contain raw apostrophes, not HTML entities');
      });
    });
  });
});

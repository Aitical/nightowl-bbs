# Design
- API: POST /api/login, GET /api/bases, GET /api/bases/:id/threads?page=, GET /api/threads/:id, POST /api/bases/:id/threads, POST /api/threads/:id/replies, POST /api/sysop/chat, GET /api/threads/:id/summary, GET /api/events (SSE).
- Store: { callers: {handle: {calls, lastSeen}}, bases: [...], threads: [{id, baseId, subject, posts:[{author, body, ts, held?, reason?}]}] }.
- ansi.js: tokenizer → spans; HTML-escape every text run first (property: output never contains '<' outside generated span tags).
- terminal.js: fixed 80-col grid, screen state machine (CONNECT → LOGIN → MENU → BASES → THREAD → COMPOSE → SYSOP → BYE).
- sysop.js: chat(), moderate(), summarize(); provider adapter + fallback; prompts kept in server/prompts/.

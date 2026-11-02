# Tech
- Node.js 20+, zero-build: Express server + vanilla JS front end, no framework.
- Storage: single JSON file (data/db.json) via a tiny repository module; atomic writes.
- Real-time "who's online" and new-post notices via Server-Sent Events.
- SysOp agent: OpenAI-compatible chat API when SYSOP_API_KEY is set; otherwise deterministic fallback.
- Tests: node:test + fast-check property-based tests for the ANSI renderer and message store.
- Keep every file under 300 lines; no external CSS frameworks.

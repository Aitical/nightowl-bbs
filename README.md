# 🦉 NightOwl BBS

A dial-up-era Bulletin Board System resurrected as a modern web community board.
80×25 ANSI terminal in the browser, keyboard-first menus, and an LLM SysOp who
greets callers and moderates posts like it's 1994.

```
╔══════════════════════════════════════════════════════════════╗
║  CONNECT 14400 ~~~~||||||||||||||||||||||||||||||||||||~~~~   ║
║                                                              ║
║  ███╗   ██╗██╗ ██████╗ ██╗  ██╗████████╗ ██████╗ ██╗       ║
║  ████╗  ██║██║██╔════╝ ██║  ██║╚══██╔══╝██╔═══██╗██║       ║
║  ██╔██╗ ██║██║██║  ███╗███████║   ██║   ██║   ██║██║       ║
║  ██║╚██╗██║██║██║   ██║██╔══██║   ██║   ██║   ██║██║       ║
║  ██║ ╚████║██║╚██████╔╝██║  ██║   ██║   ╚██████╔╝███████╗  ║
║  ╚═╝  ╚═══╝╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚══════╝  ║
║                  B  B  S  ·  Node 1 of 1                    ║
╚══════════════════════════════════════════════════════════════╝
```

## Features

- **CRT terminal UI** — 80×25 ANSI colour renderer, phosphor glow, scanline
  overlay, blinking cursor. Toggle amber/green phosphor with the button.
- **Keyboard-first navigation** — `[M]` Message Bases · `[W]` Who's Online ·
  `[S]` SysOp Chat · `[B]` Bulletins · `[G]` Goodbye
- **Message bases** — General · Retro Tech · Halloween. Thread list with paging,
  read threads, post, reply.
- **Who's Online via SSE** — real-time presence list pushed from server via
  Server-Sent Events; updates live without polling.
- **LLM SysOp agent** — greets callers, moderates new posts, summarises threads.
  Uses any OpenAI-compatible API when `SYSOP_API_KEY` is set; falls back to a
  deterministic 1994 sysop persona when no key is configured.
- **Connect / NO CARRIER screens** — modem handshake animation on entry,
  `▓▒░  N O   C A R R I E R  ░▒▓` on goodbye, loaded from `.ans` art files.
- **Atomic persistence** — single `data/db.json`, written via temp-file rename.
  No external database required.
- **Zero build** — vanilla ES modules everywhere; `node server/index.js` and
  you're live.

## Requirements

- Node.js 20+
- npm (for `fast-check` dev dependency used in tests)

## Install & Run

```bash
git clone <repo-url>
cd kiroween-bbs
npm install
npm start
```

Open `http://localhost:3000` in a browser.

### Custom port

```bash
PORT=8080 npm start
```

### Run tests

```bash
npm test
```

33 tests (unit + property-based) covering the ANSI renderer and message store.

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port the server listens on |
| `SYSOP_API_KEY` | *(unset)* | OpenAI-compatible API key. Unset → deterministic fallback SysOp |
| `SYSOP_API_URL` | `https://api.openai.com/v1` | Base URL for the chat completions endpoint |
| `SYSOP_MODEL` | `gpt-4o-mini` | Model name to use for chat / moderate / summarize |
| `DB_PATH` | `data/db.json` | Override the database file path (useful for tests) |

When `SYSOP_API_KEY` is not set the board runs fully offline — the SysOp
responds with a hand-crafted 1994 persona and spam detection uses keyword
matching.

## Project Layout

```
server/
  index.js          Express routes + SSE broadcast
  store.js          Atomic JSON persistence; loginCaller, threads, replies
  ansi.js           ANSI SGR → safe HTML (escapeHtml, ansiToHtml, colorize)
  sysop.js          LLM adapter + deterministic fallback
  prompts/          system.txt  moderate.txt  summarize.txt
public/
  index.html        CRT shell: scanlines, phosphor glow, amber/green toggle
  terminal.js       State-machine renderer + keyboard handler (vanilla JS)
  screens/
    connect.ans     Modem handshake ANSI art
    welcome.ans     Main menu art
    goodbye.ans     NO CARRIER art
test/
  ansi.test.js      unit + property-based tests for the ANSI renderer
  store.test.js     unit + property-based tests for the message store
.kiro/
  specs/bbs-core/   requirements, design, tasks (spec-first workflow)
  steering/         product.md  tech.md  structure.md
  hooks/            pre-commit quality gate
data/
  db.json           Runtime database (gitignored; created on first run)
```

## Screenshots

> _Add screenshots here once the board is running._
>
> Suggested captures:
> - Connect handshake animation
> - Main menu (amber phosphor)
> - Thread list in the Halloween base
> - SysOp chat exchange
> - NO CARRIER goodbye screen

## How This Project Was Built with Kiro

NightOwl BBS was developed spec-first using [Kiro](https://kiro.dev), an
AI-assisted development environment. Here's how the Kiro workflow shaped the
project:

### Specs (`/.kiro/specs/bbs-core/`)

Kiro specs capture requirements, design decisions, and a task list before any
code is written. For this project:

- **`requirements.md`** — eight numbered requirements (ANSI UI, login, message
  bases, persistence, SSE presence, SysOp agent, tests, screens) each with
  explicit acceptance criteria.
- **`design.md`** — module boundaries, API surface, data shapes, and the ANSI
  renderer property that guided the test suite.
- **`tasks.md`** — nine implementation tasks linked back to requirements, ticked
  off as each feature shipped.

### Steering (`/.kiro/steering/`)

Steering files are always-on context injected into every Kiro session:

- **`product.md`** — product vision (retro BBS, 1994 sysop, cozy community).
- **`tech.md`** — tech constraints (Node 20, zero-build, single JSON file, SSE,
  node:test + fast-check).
- **`structure.md`** — directory layout so Kiro always puts files in the right
  place.

### Hooks (`/.kiro/hooks/`)

The pre-commit hook runs `npm test` automatically before every `git commit`,
ensuring the test suite stays green throughout development.

### Workflow

1. Write steering files to lock in product vision and tech constraints.
2. Use Kiro to generate specs (requirements → design → tasks).
3. Implement task by task; Kiro reads specs and steering for context on every
   step.
4. Property-based tests (fast-check) let Kiro verify invariants — "output never
   contains raw `<` outside span tags" — across thousands of random inputs.
5. Tick tasks off in `tasks.md` as each feature is verified and committed.

## License

MIT — see [LICENSE](./LICENSE).

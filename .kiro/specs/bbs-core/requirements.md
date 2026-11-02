# Requirements — NightOwl BBS core

## R1 Connect screen
WHEN a visitor opens the site THE SYSTEM SHALL play a simulated modem handshake (text "ATDT 555-0199 ... CONNECT 2400") and then render the ANSI welcome screen.

## R2 Handle login
WHEN a caller enters a handle (3–16 chars, [A-Za-z0-9_]) THE SYSTEM SHALL create or resume that caller and record last-call time and call count.
IF the handle is invalid THEN THE SYSTEM SHALL show an inline error in red ANSI text.

## R3 Main menu
THE SYSTEM SHALL show a single-key main menu: M Message bases, W Who's online, S Talk to SysOp, B Bulletins, G Goodbye.

## R4 Message bases
THE SYSTEM SHALL provide at least three message bases (General, Retro Tech, Halloween).
WHEN a caller posts THE SYSTEM SHALL store subject, body (≤ 2000 chars), author, timestamp.
THE SYSTEM SHALL list threads newest-first, 15 per page, with N/P paging keys.

## R5 Who's online
THE SYSTEM SHALL show callers active in the last 5 minutes, updated live via SSE.

## R6 SysOp agent
WHEN a caller chats with the SysOp THE SYSTEM SHALL reply in-character (1990s sysop voice, ≤ 80 cols per line).
WHEN a new post is submitted THE SYSTEM SHALL run SysOp moderation; IF flagged THEN the post is held with a reason.
WHEN a caller presses "Z" in a thread THE SYSTEM SHALL return a 3-line summary.
IF no API key is configured THEN THE SYSTEM SHALL use a deterministic fallback persona.

## R7 ANSI rendering
THE SYSTEM SHALL convert ANSI SGR sequences (colors 30–37, 90–97, bold, reset) to escaped HTML spans; rendering must never inject raw HTML.

## R8 Goodbye
WHEN a caller presses G THE SYSTEM SHALL show "NO CARRIER" and return to the connect screen.

## R9 Static demo mode (GitHub Pages)
WHEN the API is unreachable (e.g. the app is served as static files from GitHub Pages under a sub-path such as `/nightowl-bbs/`) THE SYSTEM SHALL run fully client-side using `public/demo-api.js`, which implements the identical API surface (login, bases, threads with paging, post, reply, sysop chat/summary/moderation fallback, simulated who's online with ghost callers) on top of `localStorage`, seeded with spooky sample threads.
All asset and `.ans` screen fetches MUST use relative paths so the app works correctly under any sub-path.

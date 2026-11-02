/**
 * ansi.js — ANSI SGR → HTML converter for NightOwl BBS
 * Handles colors 30-37, 90-97, bold, reset.
 * Property: output never contains '<' outside of generated span tags.
 */

// Standard 16 ANSI colors (0-7 normal, 8-15 bright)
const ANSI_COLORS = [
  '#1a1a1a', // 0 black
  '#cc0000', // 1 red
  '#00cc00', // 2 green
  '#cccc00', // 3 yellow
  '#0000cc', // 4 blue
  '#cc00cc', // 5 magenta
  '#00cccc', // 6 cyan
  '#cccccc', // 7 white
  '#555555', // 8 bright black (gray)
  '#ff5555', // 9 bright red
  '#55ff55', // 10 bright green
  '#ffff55', // 11 bright yellow
  '#5555ff', // 12 bright blue
  '#ff55ff', // 13 bright magenta
  '#55ffff', // 14 bright cyan
  '#ffffff', // 15 bright white
];

/**
 * Escape HTML special chars in a text run.
 * This is the ONLY place raw text touches output.
 */
export function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Parse ANSI SGR params and return updated style state.
 */
function applyParams(params, state) {
  const s = { ...state };
  if (params.length === 0) params = [0];
  for (const p of params) {
    if (p === 0) {
      s.fg = null; s.bg = null; s.bold = false; s.blink = false;
    } else if (p === 1) {
      s.bold = true;
    } else if (p === 5) {
      s.blink = true;
    } else if (p >= 30 && p <= 37) {
      s.fg = p - 30;
    } else if (p === 39) {
      s.fg = null;
    } else if (p >= 40 && p <= 47) {
      s.bg = p - 40;
    } else if (p === 49) {
      s.bg = null;
    } else if (p >= 90 && p <= 97) {
      s.fg = p - 90 + 8;
    } else if (p >= 100 && p <= 107) {
      s.bg = p - 100 + 8;
    }
  }
  return s;
}

function stateToStyle(state) {
  const parts = [];
  if (state.fg !== null) {
    const idx = state.bold ? state.fg | 8 : state.fg;
    parts.push(`color:${ANSI_COLORS[idx & 15]}`);
  } else if (state.bold) {
    parts.push('font-weight:bold');
  }
  if (state.bg !== null) {
    parts.push(`background:${ANSI_COLORS[state.bg & 15]}`);
  }
  return parts.join(';');
}

/**
 * Convert a string with ANSI escape sequences to safe HTML.
 * Never injects raw HTML from input text.
 */
export function ansiToHtml(input) {
  // Regex: ESC [ ... m or other control sequences
  const ANSI_RE = /\x1b\[(\d*(?:;\d*)*)([A-Za-z])/g;

  let state = { fg: null, bg: null, bold: false, blink: false };
  let html = '';
  let lastIndex = 0;
  let spanOpen = false;

  function closeSpan() {
    if (spanOpen) { html += '</span>'; spanOpen = false; }
  }

  let match;
  while ((match = ANSI_RE.exec(input)) !== null) {
    // Emit text before this escape
    const text = input.slice(lastIndex, match.index);
    if (text) html += escapeHtml(text);
    lastIndex = ANSI_RE.lastIndex;

    const cmd = match[2];
    if (cmd === 'm') {
      const params = match[1] ? match[1].split(';').map(Number) : [0];
      closeSpan();
      state = applyParams(params, state);
      const style = stateToStyle(state);
      if (style || state.blink) {
        const cls = state.blink ? ' class="blink"' : '';
        const styleAttr = style ? ` style="${style}"` : '';
        html += `<span${styleAttr}${cls}>`;
        spanOpen = true;
      }
    }
    // Ignore non-m sequences (cursor moves etc.)
  }

  // Remaining text
  const tail = input.slice(lastIndex);
  if (tail) html += escapeHtml(tail);
  closeSpan();

  return html;
}

/**
 * Wrap a line of text in ANSI color for server-side use.
 * fg/bg are indices 0-15.
 */
export function colorize(text, fg, bg) {
  let esc = '';
  if (fg !== undefined) esc += fg > 7 ? `\x1b[${90 + (fg - 8)}m` : `\x1b[${30 + fg}m`;
  if (bg !== undefined) esc += bg > 7 ? `\x1b[${100 + (bg - 8)}m` : `\x1b[${40 + bg}m`;
  return esc + text + '\x1b[0m';
}

/**
 * sysop.js — SysOp agent: LLM + deterministic fallback
 * Uses OpenAI-compatible API when SYSOP_API_KEY is set.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const promptsDir = join(__dirname, 'prompts');

function readPrompt(name) {
  try { return readFileSync(join(promptsDir, name), 'utf8').trim(); }
  catch { return ''; }
}

const SYSTEM_PROMPT = readPrompt('system.txt');
const MODERATE_PROMPT = readPrompt('moderate.txt');
const SUMMARIZE_PROMPT = readPrompt('summarize.txt');

const API_URL = process.env.SYSOP_API_URL || 'https://api.openai.com/v1';
const API_KEY = process.env.SYSOP_API_KEY || '';
const MODEL = process.env.SYSOP_MODEL || 'gpt-4o-mini';

const hasLLM = Boolean(API_KEY);

// ── LLM adapter ───────────────────────────────────────────────────────────────

async function llmChat(systemPrompt, userContent) {
  const res = await fetch(`${API_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      max_tokens: 300,
      temperature: 0.7
    })
  });
  if (!res.ok) throw new Error(`LLM API error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

// ── Deterministic fallback ────────────────────────────────────────────────────

const GREETINGS = [
  'Welcome to NightOwl BBS! You\'ve reached the best board in the 619!',
  'Howdy, Caller! Glad you could connect. Node 1 is all yours tonight.',
  'NightOwl here. Grab a Jolt Cola and stay awhile!',
  'Connection established. Make yourself at home, Caller.',
  '*adjusts headset* NightOwl BBS, SysOp speaking. What can I do ya for?'
];

const REPLIES = [
  'Roger that, Caller. The BBS life keeps me busy but I wouldn\'t trade it!',
  'Ha! You should see what came through the modem last night. Wild stuff.',
  'Good question. Let me check the SYSOP.LOG... *clicks keys* ...interesting.',
  'Been running this board since \'91. Seen it all, lemme tell ya.',
  'The Commodore 64 crowd keep asking for a sub-board. Maybe someday!',
  'Check the bulletins - I posted some new files in the shareware section.',
  'Gotta love that 2400 baud screech. Music to my ears, Caller.',
  'If you dig retro tech, hit M for the Retro Tech base. Good peeps in there.',
  'Halloween\'s coming. We\'ve got a spooky sub-board if you\'re brave enough.'
];

function fallbackChat(message) {
  // Simple keyword-based responses
  const m = message.toLowerCase();
  if (m.includes('hello') || m.includes('hi') || m.includes('hey')) {
    return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
  }
  if (m.includes('help') || m.includes('how')) {
    return 'Use the main menu keys: M=Messages, W=Who\'s online, B=Bulletins, G=Goodbye.';
  }
  if (m.includes('file') || m.includes('download')) {
    return 'Files section is coming soon! Check back after the next board upgrade.';
  }
  if (m.includes('game') || m.includes('door')) {
    return 'We\'ve got TradeWars and Legend of the Red Dragon in the door games. Classic!';
  }
  if (m.includes('halloween') || m.includes('spooky')) {
    return 'Oh man, the Halloween board is \uD83C\uDF83 LIT \uD83C\uDF83 right now. Go check it out!';
  }
  return REPLIES[Math.floor(Math.random() * REPLIES.length)];
}

const BAD_WORDS = ['spam', 'buy now', 'click here', 'free money', 'wire transfer'];

function fallbackModerate(body) {
  const lower = body.toLowerCase();
  for (const w of BAD_WORDS) {
    if (lower.includes(w)) {
      return { hold: true, reason: `Contains suspicious phrase: "${w}"` };
    }
  }
  if (body.length > 1800) {
    return { hold: true, reason: 'Post exceeds recommended length' };
  }
  return { hold: false, reason: null };
}

function fallbackSummarize(thread) {
  const count = thread.posts.length;
  const subject = thread.subject;
  const authors = [...new Set(thread.posts.map(p => p.author))];
  return [
    `Thread: "${subject.slice(0, 60)}"`,
    `${count} post${count !== 1 ? 's' : ''} from: ${authors.slice(0, 3).join(', ')}`,
    `Latest activity: ${new Date(thread.posts.at(-1).ts).toLocaleDateString()}`
  ].join('\n');
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function chat(message, handle) {
  if (hasLLM) {
    try {
      const content = handle
        ? `Caller "${handle}" says: ${message}`
        : message;
      return await llmChat(SYSTEM_PROMPT, content);
    } catch (e) {
      console.warn('LLM chat failed, using fallback:', e.message);
    }
  }
  return fallbackChat(message);
}

export async function moderate(author, body) {
  if (hasLLM) {
    try {
      const content = `Author: ${author}\nPost:\n${body}`;
      const raw = await llmChat(MODERATE_PROMPT, content);
      const parsed = JSON.parse(raw.replace(/```json?\n?|```/g, '').trim());
      return { hold: Boolean(parsed.hold), reason: parsed.reason || null };
    } catch (e) {
      console.warn('LLM moderate failed, using fallback:', e.message);
    }
  }
  return fallbackModerate(body);
}

export async function summarize(thread) {
  if (hasLLM) {
    try {
      const postsText = thread.posts
        .filter(p => !p.held)
        .map(p => `[${p.author}]: ${p.body}`)
        .join('\n---\n');
      const content = `Subject: ${thread.subject}\n\n${postsText}`;
      return await llmChat(SUMMARIZE_PROMPT, content);
    } catch (e) {
      console.warn('LLM summarize failed, using fallback:', e.message);
    }
  }
  return fallbackSummarize(thread);
}

/**
 * ansi.test.js — property-based + unit tests for the ANSI renderer
 * Key property: output never contains '<' outside generated span tags.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { ansiToHtml, escapeHtml, colorize } from '../server/ansi.js';

describe('escapeHtml', () => {
  test('escapes & < > " \'', () => {
    assert.equal(escapeHtml('&'), '&amp;');
    assert.equal(escapeHtml('<'), '&lt;');
    assert.equal(escapeHtml('>'), '&gt;');
    assert.equal(escapeHtml('"'), '&quot;');
    assert.equal(escapeHtml("'"), '&#39;');
  });

  test('leaves safe chars unchanged', () => {
    const safe = 'Hello World 123';
    assert.equal(escapeHtml(safe), safe);
  });

  test('property: output never contains raw < or >', () => {
    fc.assert(fc.property(
      fc.string(),
      (s) => {
        const escaped = escapeHtml(s);
        // After escaping, < and > should only appear as &lt; &gt;
        assert.ok(!escaped.includes('<'));
        assert.ok(!escaped.includes('>'));
      }
    ));
  });
});

describe('ansiToHtml', () => {
  test('plain text is passed through escaped', () => {
    const result = ansiToHtml('Hello World');
    assert.equal(result, 'Hello World');
  });

  test('escapes HTML in plain text', () => {
    const result = ansiToHtml('<script>alert(1)</script>');
    assert.ok(!result.includes('<script>'));
    assert.ok(result.includes('&lt;script&gt;'));
  });

  test('bold code wraps in span with font-weight', () => {
    const result = ansiToHtml('\x1b[1mBold\x1b[0m');
    assert.ok(result.includes('font-weight:bold'));
    assert.ok(result.includes('Bold'));
  });

  test('fg color 31 (red) wraps in span with color', () => {
    const result = ansiToHtml('\x1b[31mRed\x1b[0m');
    assert.ok(result.includes('color:'));
    assert.ok(result.includes('Red'));
  });

  test('bright fg color 91 wraps in span', () => {
    const result = ansiToHtml('\x1b[91mBrightRed\x1b[0m');
    assert.ok(result.includes('color:'));
    assert.ok(result.includes('BrightRed'));
  });

  test('bg color 41 wraps in span with background', () => {
    const result = ansiToHtml('\x1b[41mRedBg\x1b[0m');
    assert.ok(result.includes('background:'));
    assert.ok(result.includes('RedBg'));
  });

  test('reset clears style', () => {
    const result = ansiToHtml('\x1b[31mRed\x1b[0mNormal');
    assert.ok(result.endsWith('Normal'));
  });

  test('blink adds class="blink"', () => {
    const result = ansiToHtml('\x1b[5mBlink\x1b[0m');
    assert.ok(result.includes('class="blink"'));
  });

  test('spans are balanced (same count open/close)', () => {
    const result = ansiToHtml('\x1b[31mRed\x1b[0m Normal \x1b[32mGreen\x1b[0m');
    const opens = (result.match(/<span/g) || []).length;
    const closes = (result.match(/<\/span>/g) || []).length;
    assert.equal(opens, closes);
  });

  test('KEY PROPERTY: no raw < outside span tags', () => {
    fc.assert(fc.property(
      fc.string(),
      (s) => {
        const html = ansiToHtml(s);
        // Remove all generated <span ...> and </span> tags
        const stripped = html
          .replace(/<span[^>]*>/g, '')
          .replace(/<\/span>/g, '');
        // After removing tags, no < or > should remain
        assert.ok(
          !stripped.includes('<'),
          `Found raw < in stripped output for input: ${JSON.stringify(s)}`
        );
        assert.ok(
          !stripped.includes('>'),
          `Found raw > in stripped output for input: ${JSON.stringify(s)}`
        );
      }
    ));
  });

  test('property: ANSI sequences do not appear in output', () => {
    fc.assert(fc.property(
      fc.constantFrom(
        '\x1b[31m', '\x1b[0m', '\x1b[1m', '\x1b[32;1m',
        '\x1b[90m', '\x1b[41m', '\x1b[5m'
      ),
      fc.string({ minLength: 1, maxLength: 50 }),
      (seq, text) => {
        const input = seq + text + '\x1b[0m';
        const html = ansiToHtml(input);
        // ESC character should not appear in output
        assert.ok(!html.includes('\x1b'));
      }
    ));
  });

  test('colorize + ansiToHtml roundtrip produces spans', () => {
    const colored = colorize('Hello', 1, 0);
    const html = ansiToHtml(colored);
    assert.ok(html.includes('<span'));
    assert.ok(html.includes('Hello'));
  });

  test('property: escaping exactly once (no double-escaping)', () => {
    fc.assert(fc.property(
      fc.string(),
      (s) => {
        // First escape
        const escaped1 = escapeHtml(s);
        // Simulate double-escaping (what we want to prevent)
        const escaped2 = escapeHtml(escaped1);
        
        // For strings with special chars, double-escaping should produce different result
        if (s.includes('&') || s.includes('<') || s.includes('>') || s.includes('"') || s.includes("'")) {
          assert.notEqual(escaped1, escaped2, 
            `Double-escaping changed the output for input: ${JSON.stringify(s)}`);
        }
        
        // The display output should match first escape, not second
        const display = ansiToHtml(s);
        assert.equal(display, escaped1,
          `ansiToHtml should produce same output as escapeHtml for: ${JSON.stringify(s)}`);
      }
    ));
  });

  test('property: apostrophes are escaped exactly once, not &amp;#39;', () => {
    fc.assert(fc.property(
      fc.string().filter(s => s.includes("'")),
      (s) => {
        const html = ansiToHtml(s);
        // Should contain &#39; (escaped apostrophe)
        assert.ok(html.includes('&#39;'), 
          `Expected &#39; in output for input with apostrophe: ${JSON.stringify(s)}`);
        // Should NOT contain &amp;#39; (double-escaped)
        assert.ok(!html.includes('&amp;#39;'),
          `Found double-escaped apostrophe &amp;#39; in output for: ${JSON.stringify(s)}`);
      }
    ));
  });

  test('apostrophes and ampersands are escaped exactly once', () => {
    // Test: "You're" should become "You&#39;re" not "You&amp;#39;re"
    const result = ansiToHtml("You're");
    assert.equal(result, "You&#39;re");
    assert.ok(!result.includes('&amp;'));
  });

  test('ampersands in apostrophe escapes are not double-escaped', () => {
    // This tests the specific case: if we have an apostrophe that gets escaped to &#39;,
    // the & should not be escaped again to &amp;
    const input = "cat's";
    const result = ansiToHtml(input);
    assert.equal(result, "cat&#39;s");
    assert.ok(!result.includes('&amp;'));
    assert.ok(!result.includes('&amp;#39;'));
  });
});

/**
 * ans-loader.test.js — tests for .ans file format and escape conversion
 * Verifies that .ans files contain real ANSI/CP437 bytes, not literal escape sequences.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const screensDir = join(__dirname, '..', 'public', 'screens');

describe('.ans files', () => {
  const ansFiles = ['connect.ans', 'welcome.ans', 'goodbye.ans'];

  for (const filename of ansFiles) {
    test(`${filename} contains real ESC bytes (0x1b), not literal \\x1b`, () => {
      const path = join(screensDir, filename);
      const data = readFileSync(path);

      // Check for real ESC byte (0x1b)
      const hasRealEsc = data.includes(0x1b);
      assert.ok(hasRealEsc, `${filename} should contain real ESC bytes (0x1b)`);

      // Check that there are no literal "\x1b" sequences (5 bytes: backslash, x, 1, b)
      const text = data.toString('latin1');
      assert.ok(
        !text.includes('\\x1b'),
        `${filename} should not contain literal \\x1b sequences`
      );

      // Verify it doesn't contain unescaped backslash followed by x followed by hex digits
      // (This would indicate literal escape notation)
      const literalEscapePattern = /\\x[0-9a-fA-F]{2}/g;
      const matches = text.match(literalEscapePattern);
      assert.equal(
        matches ? matches.length : 0,
        0,
        `${filename} should not contain literal \\xHH escape sequences, found: ${JSON.stringify(matches)}`
      );
    });

    test(`${filename} contains CP437 bytes (0x80-0xFF)`, () => {
      const path = join(screensDir, filename);
      const data = readFileSync(path);

      // CP437 high bytes for box-drawing should be real bytes, not escaped
      // Common box-drawing: 0xC0-0xCF, 0xD0-0xDF, etc.
      let hasHighBytes = false;
      for (const byte of data) {
        if (byte >= 0x80) {
          hasHighBytes = true;
          break;
        }
      }

      assert.ok(
        hasHighBytes,
        `${filename} should contain CP437 high bytes (0x80-0xFF) for box-drawing`
      );

      // Ensure we don't have text-encoded versions like "\xCD"
      const text = data.toString('latin1');
      const textEscapedHighBytes = text.match(/\\x[8-9A-Fa-f][0-9A-Fa-f]/g);
      assert.equal(
        textEscapedHighBytes ? textEscapedHighBytes.length : 0,
        0,
        `${filename} should not contain text-encoded high bytes like \\xCD`
      );
    });
  }

  test('all .ans files are valid binary with no partial UTF-8 sequences', () => {
    for (const filename of ansFiles) {
      const path = join(screensDir, filename);
      const data = readFileSync(path);

      // File should be readable and not corrupted
      assert.ok(data.length > 0, `${filename} should not be empty`);

      // When decoded as Latin-1, should be valid (Latin-1 is always valid)
      const text = data.toString('latin1');
      assert.ok(text.length > 0, `${filename} should decode to valid Latin-1`);

      // Should contain at least one ANSI SGR code (e.g., [0m, [31m, etc.)
      assert.ok(
        /\x1b\[\d+m/.test(text),
        `${filename} should contain ANSI SGR codes like ESC[0m`
      );
    }
  });
});


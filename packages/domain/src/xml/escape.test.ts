import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { escapeXml, isXmlIllegalCodePoint } from './escape.js';

const NUL = String.fromCharCode(0x00);
const VT = String.fromCharCode(0x0b);
const FF = String.fromCharCode(0x0c);
const TAB = String.fromCharCode(0x09);
const LF = String.fromCharCode(0x0a);
const CR = String.fromCharCode(0x0d);

describe('escapeXml', () => {
  it('escapes the four predefined entities and leaves apostrophe alone', () => {
    expect(escapeXml('Tom & Jerry <AS> "x" it\'s')).toBe(
      "Tom &amp; Jerry &lt;AS&gt; &quot;x&quot; it's",
    );
  });

  it('strips XML-1.0-illegal control characters (NUL, VT, FF)', () => {
    expect(escapeXml(`a${NUL}b${VT}c${FF}d`)).toBe('abcd');
  });

  it('preserves the three legal whitespace chars TAB/LF/CR', () => {
    expect(escapeXml(`a${TAB}b${LF}c${CR}d`)).toBe(`a${TAB}b${LF}c${CR}d`);
  });

  it('preserves non-ASCII text (Norwegian + astral code points)', () => {
    expect(escapeXml('Bjørn Ærø 🧾')).toBe('Bjørn Ærø 🧾');
  });

  it('classifies the boundary code points per the XML 1.0 Char production', () => {
    expect(isXmlIllegalCodePoint(0x00)).toBe(true);
    expect(isXmlIllegalCodePoint(0x08)).toBe(true);
    expect(isXmlIllegalCodePoint(0x09)).toBe(false); // TAB
    expect(isXmlIllegalCodePoint(0x0a)).toBe(false); // LF
    expect(isXmlIllegalCodePoint(0x0d)).toBe(false); // CR
    expect(isXmlIllegalCodePoint(0x1f)).toBe(true);
    expect(isXmlIllegalCodePoint(0x20)).toBe(false); // space
    expect(isXmlIllegalCodePoint(0xfffe)).toBe(true);
    expect(isXmlIllegalCodePoint(0xffff)).toBe(true);
  });

  it('property: output never carries a bare ampersand or an illegal code point', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString(), (s) => {
        const out = escapeXml(s);
        expect(/&(?!amp;|lt;|gt;|quot;)/.test(out)).toBe(false);
        const hasIllegal = Array.from(out).some((ch) =>
          isXmlIllegalCodePoint(ch.codePointAt(0) ?? 0),
        );
        expect(hasIllegal).toBe(false);
      }),
    );
  });
});

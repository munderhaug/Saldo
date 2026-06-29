/**
 * XML 1.0 text/attribute escaping for the domain's hand-built serializers (SAF-T, MVA-melding, EHF/UBL).
 * PURE. One pass, two jobs:
 *
 *  1. Escape the predefined entities `& < > "`. (Apostrophe is left as-is: it is legal in an XML text
 *     node and inside a double-quoted attribute value, and never escaping it keeps the output
 *     byte-identical to the prior per-module escapers — so the XSD-valid golden outputs don't move.)
 *
 *  2. STRIP the characters the XML 1.0 `Char` production forbids outright — the C0 controls EXCEPT the
 *     three legal whitespace chars TAB/LF/CR (0x09 / 0x0A / 0x0D), plus the 0xFFFE / 0xFFFF
 *     noncharacters. These cannot be represented even as numeric character references, so a pasted NUL,
 *     vertical tab, or form feed in a user free-text field (party/account name, line description) would
 *     otherwise produce a document NO conformant parser accepts — the export silently fails downstream
 *     at the authority rather than in CI. Removal is the only spec-valid option (you cannot escape them).
 *
 * Ref: XML 1.0 §2.2 — Char ::= #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF].
 * Well-formedness is still asserted at the app/script boundary (fast-xml-parser + xmllint); this keeps
 * the bytes those parsers see legal in the first place. (Implemented with a code-point predicate rather
 * than a control-char regex literal so the source file stays pure-ASCII and lint-clean.)
 */

/** True for a code point the XML 1.0 `Char` production forbids (must be removed, cannot be escaped). */
export function isXmlIllegalCodePoint(code: number): boolean {
  return (
    (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
    code === 0xfffe ||
    code === 0xffff
  );
}

/** Escape a string for an XML text node or a double-quoted attribute value (illegal chars stripped). */
export function escapeXml(value: string): string {
  // Array.from iterates by code point, so astral characters and surrogate pairs are handled correctly.
  const legal = Array.from(value, (ch) =>
    isXmlIllegalCodePoint(ch.codePointAt(0) ?? 0) ? '' : ch,
  ).join('');
  return legal
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

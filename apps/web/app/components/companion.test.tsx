/**
 * Companion — render tests for the balance-ball character and its guide unit (ADR 0058).
 *
 * Rendered to static markup via `react-dom/server` (the ai-assisted.test.tsx pattern: the HTML
 * string is the assertion surface, plain Node environment). What is pinned here is the DESIGN
 * CONTRACT, not pixels: the honest size ladder, tokens-only colour, decorative-by-default
 * accessibility, and the guide's dismissal that never takes the words away with the character.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Companion, CompanionGuide, type CompanionExpression } from './companion';
import { t } from '~/copy';

const EXPRESSIONS: CompanionExpression[] = [
  'attentive',
  'pleased',
  'thinking',
  'unsure',
  'resting',
];

describe('Companion — the balance ball (ADR 0058)', () => {
  it('is decorative by default: aria-hidden, no img role', () => {
    const html = renderToStaticMarkup(<Companion />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
  });

  it('carries role="img" + the label when it IS the information', () => {
    const html = renderToStaticMarkup(<Companion label="Hjelperen hviler" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Hjelperen hviler"');
    expect(html).not.toContain('aria-hidden');
  });

  it('uses only the semantic companion tokens — never a scale step raw', () => {
    for (const expression of EXPRESSIONS) {
      const html = renderToStaticMarkup(<Companion expression={expression} size={96} />);
      expect(html).toContain('var(--companion)');
      expect(html).not.toContain('electric');
    }
  });

  it('renders the full face at 96 and 64 px, with a distinct drawing per expression', () => {
    for (const size of [96, 64] as const) {
      const drawings = EXPRESSIONS.map((expression) =>
        renderToStaticMarkup(<Companion expression={expression} size={size} />),
      );
      expect(new Set(drawings).size).toBe(EXPRESSIONS.length);
      for (const html of drawings) expect(html).toContain('var(--companion-foreground)');
    }
  });

  it('degrades honestly to eyes only at 32 and 20 px — expression no longer changes the drawing', () => {
    for (const size of [32, 20] as const) {
      const [first, ...rest] = EXPRESSIONS.map((expression) =>
        renderToStaticMarkup(<Companion expression={expression} size={size} />),
      );
      for (const html of rest) expect(html).toBe(first);
      expect(first).toContain('var(--companion-foreground)'); // the eyes
      expect(first).not.toContain('<path'); // no mouth below full expression
    }
  });

  it('is the plain ambient status dot at 12 px — one circle, no features', () => {
    const html = renderToStaticMarkup(<Companion expression="pleased" size={12} />);
    expect(html.match(/<circle/g)).toHaveLength(1);
    expect(html).not.toContain('var(--companion-foreground)');
  });

  it('has no blaming or alarmed expression — the set is closed at the type level', () => {
    // Compile-time guarantee restated as data: these five are all there are (ADR 0058: the most
    // negative the companion can express is its own curious uncertainty).
    expect(EXPRESSIONS).toEqual(['attentive', 'pleased', 'thinking', 'unsure', 'resting']);
  });
});

describe('CompanionGuide — dismissible, never blocking (ADR 0058 behaviour rules)', () => {
  const html = renderToStaticMarkup(
    <CompanionGuide message="Så snart du registrerer inntekt, viser jeg det her." redirectTo="/" />,
  );

  it('is plain flow content — never an overlay/dialog, and never a landmark that AT users skip', () => {
    // No <aside>: the message is primary content (a11y review 2026-07-05 — a complementary
    // landmark would hide it from landmark navigation while the dismissed state shows it plainly).
    expect(html).not.toContain('<aside');
    expect(html).not.toContain('role="dialog"');
  });

  it('keeps the character decorative — the message text carries the meaning', () => {
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('Så snart du registrerer inntekt, viser jeg det her.');
  });

  it('dismisses through a real form POST to /companion — server-authoritative, works without JS', () => {
    expect(html).toMatch(/<form[^>]*action="\/companion"[^>]*method="post"/);
    expect(html).toContain('name="companion" value="off"');
    expect(html).toContain('name="redirectTo" value="/"');
    expect(html).toContain(t('companion.dismiss'));
  });
});

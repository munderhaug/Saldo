/**
 * AiAssisted — render test for the shared EU AI Act Art. 50 disclosure primitive (ADR 0036).
 *
 * Rendered to static markup via `react-dom/server` (already a dependency): no jsdom or
 * testing-library is added — the HTML string is the assertion surface, and the test runs in the same
 * plain-Node environment as the rest of the suite. It pins the compliance contract structurally: an
 * AI proposal is always disclosed, labelled, and perceivable wherever the primitive is shown.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AiAssisted } from './ai-assisted';
import { t } from '~/copy';

function render(props: Partial<Parameters<typeof AiAssisted>[0]> = {}): string {
  return renderToStaticMarkup(
    <AiAssisted
      id="disc"
      heading="Forslag fra kvitteringen"
      disclosure="Dette forslaget er laget av AI."
      provenance="Foreslått av qwen2.5-vl."
      {...props}
    >
      <dl>
        <dt>{'Leverandør'}</dt>
        <dd>{'Acme'}</dd>
      </dl>
    </AiAssisted>,
  );
}

describe('AiAssisted — Art. 50 disclosure treatment', () => {
  it('renders the machine-readable "AI-assisted" label as TEXT, not colour alone (Art. 50(2))', () => {
    const html = render();
    expect(html).toContain(t('ai.assistedLabel'));
    expect(html).toContain('data-ai-assisted="true"');
  });

  it('discloses the AI interaction and its provenance (Art. 50(1) + (2))', () => {
    const html = render();
    expect(html).toContain('Dette forslaget er laget av AI.');
    expect(html).toContain('Foreslått av qwen2.5-vl.');
  });

  it('exposes a real labelled heading region — perceivable structure (WCAG 2.2 AA)', () => {
    const html = render();
    // The section is named by a real <h2>, tied together via aria-labelledby (not colour/placement).
    expect(html).toMatch(/<section[^>]*aria-labelledby="disc-heading"/);
    expect(html).toMatch(/<h2[^>]*id="disc-heading"[^>]*>/);
    expect(html).toContain('Forslag fra kvitteringen');
  });

  it('keeps the heading programmatically focusable for the round-trip reveal (WCAG 2.4.3 / 4.1.3)', () => {
    expect(render({ focusOnMount: true })).toMatch(/<h2[^>]*tabindex="-1"/i);
  });

  it('wraps the surface-specific proposed fields between disclosure and provenance', () => {
    expect(render()).toContain('<dd>Acme</dd>');
  });
});

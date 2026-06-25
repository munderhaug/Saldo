/**
 * AiAssisted — the shared EU AI Act Art. 50 disclosure treatment for every AI surface (ADR 0036).
 *
 * Saldo's first AI surface (receipt extraction, ADR 0035) disclosed its proposal as AI-assisted with a
 * bespoke block. This is that treatment generalised into ONE reusable, accessible primitive: every
 * current and future AI surface discloses consistently at the first interaction (Art. 50(1)) and
 * carries the machine-readable "AI-assisted" label (Art. 50(2)) — disclosure cannot drift per surface.
 *
 * What it guarantees, so a surface can't get it wrong:
 *  - a real labelled region (`<section aria-labelledby>`) with a real `<h2>` — perceivable structure,
 *    not colour or placement alone (WCAG 2.2 AA; .claude/rules/accessibility.md);
 *  - the "AI-assistert" badge as TEXT (never colour alone) plus a `data-ai-assisted` marker — the
 *    machine-readable label (Art. 50(2));
 *  - the first-interaction disclosure copy (Art. 50(1)) and the provenance line (model + confidence,
 *    Art. 50(2)) in fixed positions around the surface's content;
 *  - optional focus-to-heading on mount, for a surface that reveals the proposal on a server
 *    round-trip — the SR/keyboard user lands on the new, legally required content (WCAG 2.4.3 / 4.1.3).
 *
 * The proposal's own reviewed fields are passed as `children`: this primitive owns the DISCLOSURE,
 * the surface owns the content. It is disclosure-only — it never posts, scores, or profiles a natural
 * person (ADR 0002; Annex III §5(b), the line never to cross).
 */
import { useEffect, useRef } from 'react';
import { t } from '~/copy';

interface AiAssistedProps {
  /** Stable id base so `aria-labelledby` resolves; unique per instance on a page. */
  readonly id: string;
  /** The surface's own framing of the proposal (e.g. "Forslag fra kvitteringen"). */
  readonly heading: string;
  /** First-interaction disclosure copy (Art. 50(1)) — plain, the user stays in charge. */
  readonly disclosure: string;
  /** Provenance line (Art. 50(2)) — already-formatted model + confidence, passed in by the surface. */
  readonly provenance: string;
  /**
   * Move focus to the heading on mount. A surface that reveals the proposal on a server round-trip
   * MUST set this: it lands the SR/keyboard user on the new, legally required disclosure (WCAG 2.4.3),
   * and the heading is the announced status (4.1.3). Without it, a round-trip reveal would be silent.
   */
  readonly focusOnMount?: boolean;
  /** The surface-specific reviewed fields, rendered between the disclosure and the provenance line. */
  readonly children?: React.ReactNode;
}

export function AiAssisted({
  id,
  heading,
  disclosure,
  provenance,
  focusOnMount = false,
  children,
}: AiAssistedProps) {
  const headingId = `${id}-heading`;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);

  return (
    <section
      aria-labelledby={headingId}
      // Machine-readable marker (Art. 50(2)) — this region carries AI-generated content.
      data-ai-assisted="true"
      className="border-border grid gap-2 rounded-md border p-4"
    >
      {/* `tabIndex={-1}` makes the heading programmatically focusable (never a tab stop) so a surface
          can land focus here when the proposal first appears. */}
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className="font-text text-sm">
        <span className="bg-secondary text-secondary-foreground mr-2 rounded px-1.5 py-0.5 text-xs">
          {t('ai.assistedLabel')}
        </span>
        {heading}
      </h2>
      <p className="text-muted-foreground text-sm">{disclosure}</p>
      {children}
      <p className="text-muted-foreground text-xs">{provenance}</p>
    </section>
  );
}

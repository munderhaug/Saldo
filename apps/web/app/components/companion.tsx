/**
 * The companion — the embodied voice of the playful, guided experience (ADR 0025), drawn as the
 * round "balance ball" the visual-identity spike chose (ADR 0058; visual reference
 * `docs/design/visual-identity-spike.html`). Saldo means balance; the companion is the simplest
 * thing that balances — a circle, `--companion` body, `--companion-foreground` "ink" features
 * (both theme-stable semantic tokens, never a scale step raw).
 *
 * The rules this component makes mechanical:
 *  - **Honest size ladder** (ADR 0058 §4): 96/64 px = full expression → 32/20 px = eyes only →
 *    12 px = the plain ambient status dot. The type only admits rungs of the ladder, and the
 *    detail level follows from the size — a caller cannot render a shrunken face.
 *  - **No blaming expression exists.** The set is attentive · pleased · thinking · unsure
 *    (curious, owning its own doubt) · resting. There is deliberately no angry/disappointed/
 *    alarmed variant (the system owns all fault) and no `absent` value — absence at the §5.5
 *    consequential moments is expressed by NOT rendering the companion at all.
 *  - **Decorative by default.** Without a `label` the SVG is `aria-hidden` (the surrounding copy
 *    carries the meaning); with one it is `role="img"` + `aria-label`.
 *
 * The character's name and face are NOT final (gated on `companion-user-validation`) — nothing
 * here or in the copy keys refers to the working name; the companion is addressed structurally.
 * The figure is deterministic UI, not an AI system; if it ever speaks LLM-generated text, that
 * utterance must go through the AI-disclosure treatment (ADR 0022/0036) — the face never exempts
 * the speech.
 */
import { t } from '~/copy';

export type CompanionExpression = 'attentive' | 'pleased' | 'thinking' | 'unsure' | 'resting';

/** The rungs of ADR 0058's degradation ladder — the only sizes the companion renders at. */
type CompanionSize = 96 | 64 | 32 | 20 | 12;

const BODY = 'var(--companion)';
const INK = 'var(--companion-foreground)';

interface CompanionProps {
  readonly expression?: CompanionExpression;
  readonly size?: CompanionSize;
  /** Meaning, when the companion itself is the information — omit when the copy beside it is. */
  readonly label?: string;
}

/** Open dot eyes — the shared gaze of the attentive/thinking/unsure faces. */
function Eyes({ cy = 45 }: { readonly cy?: number }) {
  return (
    <>
      <circle cx="38" cy={cy} r="4.5" fill={INK} />
      <circle cx="58" cy={cy} r="4.5" fill={INK} />
    </>
  );
}

function Face({ expression }: { readonly expression: CompanionExpression }) {
  switch (expression) {
    case 'attentive':
      return (
        <>
          <Eyes />
          <path
            d="M40,59 q8,6 16,0"
            stroke={INK}
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
        </>
      );
    case 'pleased':
      return (
        <>
          <path
            d="M32,45 q5,-6 10,0 M54,45 q5,-6 10,0"
            stroke={INK}
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M37,57 q11,10 22,0"
            stroke={INK}
            strokeWidth="3.5"
            fill="none"
            strokeLinecap="round"
          />
        </>
      );
    case 'thinking':
      return (
        <>
          <Eyes cy={43} />
          <path d="M42,62 h11" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <circle cx="76" cy="16" r="4" fill={BODY} />
          <circle cx="84" cy="7" r="2.5" fill={BODY} />
        </>
      );
    case 'unsure':
      // Uneven eyes + a small "o" mouth: curious about its own doubt — never alarm, never blame.
      return (
        <>
          <circle cx="38" cy="46" r="4" fill={INK} />
          <circle cx="58" cy="44" r="6" fill={INK} />
          <circle cx="48" cy="62" r="3.5" fill="none" stroke={INK} strokeWidth="3" />
        </>
      );
    case 'resting':
      // Closed eyes, no mouth: "all clear — nothing needs you" (earned irrelevance).
      return (
        <path
          d="M33,47 h10 M53,47 h10"
          stroke={INK}
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
      );
  }
}

export function Companion({ expression = 'attentive', size = 64, label }: CompanionProps) {
  const a11y = label
    ? ({ role: 'img', 'aria-label': label } as const)
    : ({ 'aria-hidden': true } as const);
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" {...a11y}>
      {size >= 64 ? (
        <>
          <circle cx="48" cy="50" r="32" fill={BODY} />
          <Face expression={expression} />
        </>
      ) : size >= 20 ? (
        // Eyes only — expression detail degrades honestly below 64 px.
        <>
          <circle cx="48" cy="48" r="34" fill={BODY} />
          <circle cx="37" cy="44" r="6" fill={INK} />
          <circle cx="59" cy="44" r="6" fill={INK} />
        </>
      ) : (
        // 12 px: the companion at rest IS the plain ambient status dot.
        <circle cx="48" cy="48" r="40" fill={BODY} />
      )}
    </svg>
  );
}

interface CompanionGuideProps {
  /** The keyed, already-`t()`-resolved line the companion accompanies. */
  readonly message: string;
  /** Same-app path to return to after dismissing (validated server-side by the /companion action). */
  readonly redirectTo: string;
  readonly expression?: CompanionExpression;
}

/**
 * A guidance moment: the companion beside one line of copy, with a quiet way to send it away.
 *
 * Behaviour rules (ADR 0058 §4, inherited from ADR 0025): dismissible — the plain `<form>` posts
 * the preference to `/companion` (server-authoritative, works without JS) and the message TEXT
 * stays when the character goes, so dismissing never removes information; never blocking — plain
 * flow content, never an overlay; never nagging — no counters, no streaks, and once dismissed it
 * stays away until the user brings it back (settings). Never render this at the §5.5 consequential
 * moments: absence is the sobriety signal.
 *
 * Deliberately NOT a landmark: the message is primary flow content (often the reason an empty page
 * is empty), and an `<aside>` would demote it to a skippable `complementary` region for exactly the
 * screen-reader users who navigate by landmark (a11y review, 2026-07-05). The character is
 * decorative and the dismiss button names itself.
 */
export function CompanionGuide({
  message,
  redirectTo,
  expression = 'attentive',
}: CompanionGuideProps) {
  return (
    <div className="flex items-start gap-3">
      <Companion expression={expression} size={64} />
      <div className="grid gap-1 self-center">
        <p className="text-sm">{message}</p>
        <form method="post" action="/companion">
          <input type="hidden" name="companion" value="off" />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <button
            type="submit"
            className="text-muted-foreground font-text inline-flex min-h-11 items-center text-xs underline-offset-4 hover:underline"
          >
            {t('companion.dismiss')}
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Sectoral VAT exemptions (mval kap. 3) — the *activity* dimension of VAT treatment, layered on the
 * registration gate in `line-treatment.ts`. Whether a supply carries VAT depends not only on the org's
 * `mva_status` (registration) and the line's SAF-T code, but on the **activity** the supply belongs to:
 * several whole activities are *unntatt* (outside the VAT Act) by sector — helse (§ 3-2), sosiale (§ 3-4),
 * undervisning (§ 3-5), finansielle (§ 3-6), kunst/kultur (§ 3-7), idrett (§ 3-8), utleie av fast eiendom
 * (§ 3-11 (1)) — so their revenue may NEVER carry output VAT, however the org is registered. This module gates
 * the (activity ↔ code) combination so a user can't apply the wrong treatment to an exempt activity.
 *
 * Source-grounded: db/reference/mva/2026-06-23-mval-kap3-unntak.md (+ the § 3-7 capture); distilled in
 * docs/regulatory/mva-sektorunntak.md. ADR 0030.
 *
 * Scope of THIS increment (ADR 0030): the **revenue/output** gate only — an exempt-sector line may not be
 * coded as taxable output/fritatt, and a taxable line may not be coded *unntatt*. Reduced-rate (12 %/15 %)
 * sector↔rate matching, and input-VAT apportionment for a mixed (delt) business (§ 8-2), are sequenced to
 * `vat-mixed-activity`; the input side and reverse charge are not decided here.
 */
import type { SaftTaxCode } from '../saft/tax-codes.js';
import { deriveVatTreatment } from './line-treatment.js';

/**
 * The VAT activity of a supply (per line, consistent with ADR 0027). The named sectors are the kap. 3
 * *unntak* a Saldo ENK realistically performs; `avgiftspliktig` is the catch-all for VAT-liable activity
 * (standard or reduced rate — the rate is not sector-validated in this increment).
 */
export const VAT_ACTIVITIES = [
  'helse', // § 3-2 helsetjenester
  'sosiale', // § 3-4 sosiale tjenester
  'undervisning', // § 3-5 undervisningstjenester
  'finansielle', // § 3-6 finansielle tjenester
  'kunst-kultur', // § 3-7 kunstnerisk framføring / kunst og kultur
  'idrett', // § 3-8 idrett mv.
  'utleie-fast-eiendom', // § 3-11 (1) utleie av fast eiendom (uten frivillig registrering)
  'avgiftspliktig', // VAT-liable (standard/reduced) — not an unntak sector
] as const;

export type VatActivity = (typeof VAT_ACTIVITIES)[number];

const EXEMPT_ACTIVITIES: ReadonlySet<VatActivity> = new Set([
  'helse',
  'sosiale',
  'undervisning',
  'finansielle',
  'kunst-kultur',
  'idrett',
  'utleie-fast-eiendom',
]);

/** Is this activity *unntatt* (outside the VAT Act) by sector (mval kap. 3)? */
export function activityIsExempt(activity: VatActivity): boolean {
  return EXEMPT_ACTIVITIES.has(activity);
}

export type VatActivityReason =
  | 'exempt-activity-cannot-charge-output-vat' // unntatt-sector revenue coded as taxable/fritatt output
  | 'taxable-activity-coded-exempt'; // VAT-liable revenue coded unntatt (under-charging)

export interface VatActivityVerdict {
  /** False only for a blocking (error) combination. */
  readonly ok: boolean;
  /** Present (and cited) when the combination is blocked. */
  readonly reason?: VatActivityReason;
}

/**
 * Gate the (activity, code) combination on the **revenue** side.
 *
 * - An **exempt sector** (kap. 3) line must NOT carry an output-VAT or zero-rated (fritatt) treatment:
 *   *unntatt* turnover is outside the Act — no output VAT, and (unlike *fritatt*) no zero-rate either.
 * - A **taxable** activity (`avgiftspliktig`) line must NOT carry the *exempt* (unntatt, code 6)
 *   treatment — that would book VAT-liable turnover as outside the Act (under-charging).
 * - `input-deductible`, `reverse-charge`, and `no-treatment` are NOT decided here: the input side and
 *   apportionment are `vat-mixed-activity`; reverse charge is `vat-reverse-charge`; no-treatment is a
 *   technical, activity-agnostic line. They pass this revenue gate. NB: this includes domestic
 *   reverse-charge *turnover* (code 51, `direction: 'output'`), which `deriveVatTreatment` classifies as
 *   `reverse-charge` (checked before output) — so a code-51 line on an exempt sector is NOT blocked here
 *   yet; gating it belongs to `vat-reverse-charge`. It is an unrealistic combination for an exempt ENK.
 *
 * Composed with `checkVatLine` (registration), a line is valid only when BOTH gates pass — this is the
 * activity half, catching what registration alone cannot (a *registered* org may legally charge output
 * VAT in general, yet still must not on a § 3-2 health line). NB: that composition is the intended end
 * state, **not yet the runtime behaviour of the voucher rules engine** — `vatLineRule` runs only the
 * registration gate today, because the voucher/posting line model carries no `activity` to gate on
 * (deferred per ADR 0030, sequenced to `vat-mixed-activity`). The open boundary is locked by a test in
 * `rules/vat-line.test.ts` so wiring it later is a deliberate change, not a silent one.
 */
export function checkVatActivityLine(activity: VatActivity, code: SaftTaxCode): VatActivityVerdict {
  const treatment = deriveVatTreatment(code);
  const exempt = activityIsExempt(activity);

  if (treatment === 'output-vat' || treatment === 'zero-rated-output') {
    return exempt
      ? { ok: false, reason: 'exempt-activity-cannot-charge-output-vat' }
      : { ok: true };
  }
  if (treatment === 'exempt') {
    return exempt ? { ok: true } : { ok: false, reason: 'taxable-activity-coded-exempt' };
  }
  // input-deductible / reverse-charge / no-treatment: not a revenue classification this gate owns.
  return { ok: true };
}

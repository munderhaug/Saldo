import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { SaftTaxCode } from '../saft/tax-codes.js';
import { STANDARD_TAX_CODES as codes, taxCode as code } from '../saft/tax-code.fixtures.js';
import { checkVatLine } from './line-treatment.js';
import {
  VAT_ACTIVITIES,
  type VatActivity,
  type VatActivityVerdict,
  activityIsExempt,
  checkVatActivityLine,
} from './activity.js';

// Parse the REAL committed SAF-T list (never hardcode codes from memory — hard invariant §4.3).

// ── Independent oracle: revenue-treatment code sets hand-read from the committed CSV (not the SUT's
// classifier), and the exempt-activity hand-list (not the SUT's set). The activity rule's logic below is
// hand-written; the exhaustive sweep checks the SUT against it. ──
const TAXABLE_OR_FRITATT_OUTPUT = new Set(['3', '31', '32', '33', '5', '52']); // output-vat + fritatt
const EXEMPT_REVENUE = new Set(['6']); // code 6 = unntatt (outside the VAT Act)
const EXEMPT_SECTORS: ReadonlySet<VatActivity> = new Set<VatActivity>([
  'helse',
  'sosiale',
  'undervisning',
  'finansielle',
  'kunst-kultur',
  'idrett',
  'utleie-fast-eiendom',
]);

function expectedVerdict(activity: VatActivity, c: SaftTaxCode): VatActivityVerdict {
  const exempt = EXEMPT_SECTORS.has(activity);
  if (TAXABLE_OR_FRITATT_OUTPUT.has(c.code)) {
    return exempt
      ? { ok: false, reason: 'exempt-activity-cannot-charge-output-vat' }
      : { ok: true };
  }
  if (EXEMPT_REVENUE.has(c.code)) {
    return exempt ? { ok: true } : { ok: false, reason: 'taxable-activity-coded-exempt' };
  }
  return { ok: true }; // input / reverse-charge / no-treatment: not decided by the revenue gate
}

describe('activityIsExempt — the kap. 3 sectors', () => {
  it('treats every named sector as exempt and only avgiftspliktig as taxable', () => {
    for (const a of VAT_ACTIVITIES) {
      expect(activityIsExempt(a)).toBe(a !== 'avgiftspliktig');
    }
  });
});

describe('checkVatActivityLine — activity × code, exhaustive vs. an independent oracle', () => {
  it('every activity × every committed code agrees with the sourced spec', () => {
    for (const a of VAT_ACTIVITIES) {
      for (const c of codes) {
        const verdict = checkVatActivityLine(a, c);
        expect(verdict, `${a} × code ${c.code}`).toEqual(expectedVerdict(a, c));
        if (!verdict.ok) expect(verdict.reason).toBeDefined(); // a block always says why
      }
    }
  });

  it('an exempt sector (helse) may not charge output VAT (3) or fritatt (52)', () => {
    expect(checkVatActivityLine('helse', code('3'))).toEqual({
      ok: false,
      reason: 'exempt-activity-cannot-charge-output-vat',
    });
    expect(checkVatActivityLine('helse', code('52'))).toEqual({
      ok: false,
      reason: 'exempt-activity-cannot-charge-output-vat',
    });
  });

  it('the § 3-7 case: a kunst-kultur performance line is unntatt (6), never output VAT (3)', () => {
    expect(checkVatActivityLine('kunst-kultur', code('6'))).toEqual({ ok: true });
    expect(checkVatActivityLine('kunst-kultur', code('3'))).toEqual({
      ok: false,
      reason: 'exempt-activity-cannot-charge-output-vat',
    });
  });

  it('a taxable activity must not be booked as unntatt (code 6)', () => {
    expect(checkVatActivityLine('avgiftspliktig', code('6'))).toEqual({
      ok: false,
      reason: 'taxable-activity-coded-exempt',
    });
    expect(checkVatActivityLine('avgiftspliktig', code('3'))).toEqual({ ok: true });
  });

  it('does not decide the input / no-treatment side here (passes them for any activity)', () => {
    for (const a of VAT_ACTIVITIES) {
      expect(checkVatActivityLine(a, code('1')).ok).toBe(true); // input-deductible — vat-mixed-activity
      expect(checkVatActivityLine(a, code('0')).ok).toBe(true); // technical no-treatment
      expect(checkVatActivityLine(a, code('7')).ok).toBe(true);
    }
  });

  // Boundary (ADR 0030): code 51 is domestic reverse-charge *turnover* (direction output), classified as
  // reverse-charge, so the revenue gate does NOT block it on an exempt sector yet — that gating belongs to
  // vat-reverse-charge. Locked here so the deferred boundary is explicit, not a silent surprise.
  it('does not yet gate domestic reverse-charge turnover (code 51) against an exempt sector', () => {
    expect(checkVatActivityLine('helse', code('51'))).toEqual({ ok: true });
  });
});

describe('checkVatActivityLine ∘ checkVatLine — the two gates layer', () => {
  it('catches what registration alone cannot: a registered org still may not VAT a § 3-2 health line', () => {
    // Registration gate: a registered org may charge output VAT in general → passes.
    expect(checkVatLine('registered_standard', code('3')).ok).toBe(true);
    // Activity gate: but not on an exempt-sector (helse) line → blocked.
    expect(checkVatActivityLine('helse', code('3')).ok).toBe(false);
  });

  it('a valid line passes BOTH gates (registered org, taxable activity, output code 3)', () => {
    expect(checkVatLine('registered_standard', code('3')).ok).toBe(true);
    expect(checkVatActivityLine('avgiftspliktig', code('3')).ok).toBe(true);
  });
});

describe('checkVatActivityLine — properties', () => {
  const anyCode = fc.constantFrom<SaftTaxCode>(...codes);
  const anyActivity = fc.constantFrom<VatActivity>(...VAT_ACTIVITIES);

  it('an exempt sector can never charge output VAT or fritatt', () => {
    fc.assert(
      fc.property(anyActivity, anyCode, (a, c) => {
        if (activityIsExempt(a) && TAXABLE_OR_FRITATT_OUTPUT.has(c.code)) {
          const v = checkVatActivityLine(a, c);
          expect(v.ok).toBe(false);
          expect(v.reason).toBe('exempt-activity-cannot-charge-output-vat');
        }
      }),
    );
  });

  it('exempt sector ⇔ the unntatt (code 6) revenue line is valid', () => {
    fc.assert(
      fc.property(anyActivity, (a) => {
        expect(checkVatActivityLine(a, code('6')).ok).toBe(activityIsExempt(a));
      }),
    );
  });

  it('input / reverse-charge / no-treatment codes pass the revenue gate for every activity', () => {
    fc.assert(
      fc.property(anyActivity, anyCode, (a, c) => {
        if (!TAXABLE_OR_FRITATT_OUTPUT.has(c.code) && !EXEMPT_REVENUE.has(c.code)) {
          expect(checkVatActivityLine(a, c)).toEqual({ ok: true });
        }
      }),
    );
  });

  it('a blocked verdict always carries a cited reason (fail-closed, never silent)', () => {
    fc.assert(
      fc.property(anyActivity, anyCode, (a, c) => {
        const v = checkVatActivityLine(a, c);
        if (!v.ok) expect(v.reason).toBeDefined();
      }),
    );
  });
});

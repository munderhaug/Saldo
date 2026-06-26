import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { øre, sumØre } from '../money/ore.js';
import { type OpenReceivable, agingBucket, bucketReskontro } from './reskontro.js';

const item = (
  contactId: string | null,
  contactName: string,
  amount: number,
  dueDate: string | null,
): OpenReceivable => ({ contactId, contactName, amountØre: øre(amount), dueDate });

describe('agingBucket', () => {
  const asOf = '2026-06-26';
  it('not-yet-due (or due today) is current', () => {
    expect(agingBucket('2026-06-26', asOf)).toBe('current');
    expect(agingBucket('2026-12-01', asOf)).toBe('current');
  });
  it('buckets by days overdue at the 30/60/90 boundaries', () => {
    expect(agingBucket('2026-06-25', asOf)).toBe('d1_30'); // 1 day
    expect(agingBucket('2026-05-27', asOf)).toBe('d1_30'); // 30 days
    expect(agingBucket('2026-05-26', asOf)).toBe('d31_60'); // 31 days
    expect(agingBucket('2026-04-27', asOf)).toBe('d31_60'); // 60 days
    expect(agingBucket('2026-04-26', asOf)).toBe('d61_90'); // 61 days
    expect(agingBucket('2026-03-28', asOf)).toBe('d61_90'); // 90 days
    expect(agingBucket('2026-03-27', asOf)).toBe('d90plus'); // 91 days
    expect(agingBucket('2026-01-01', asOf)).toBe('d90plus');
  });
  it('a missing or malformed due date is current', () => {
    expect(agingBucket(null, asOf)).toBe('current');
    expect(agingBucket('not-a-date', asOf)).toBe('current');
  });
});

describe('bucketReskontro', () => {
  const asOf = '2026-06-26';

  it('groups by contact, sums per bucket, and reports grand totals', () => {
    const r = bucketReskontro(
      [
        item('c1', 'Acme AS', 10_000, '2026-06-30'), // current
        item('c1', 'Acme AS', 5_000, '2026-05-01'), // d31_60
        item('c2', 'Børre AS', 8_000, '2026-01-01'), // d90plus
      ],
      asOf,
    );
    expect(r.contacts).toHaveLength(2);
    const acme = r.contacts.find((c) => c.contactId === 'c1');
    expect(acme?.buckets.current).toBe(øre(10_000));
    expect(acme?.buckets.d31_60).toBe(øre(5_000));
    expect(acme?.totalØre).toBe(øre(15_000));
    expect(r.totals.d90plus).toBe(øre(8_000));
    expect(r.totalØre).toBe(øre(23_000));
  });

  it('sorts contacts by name (nb collation)', () => {
    const r = bucketReskontro(
      [item('c2', 'Østre AS', 1, null), item('c1', 'Apt AS', 1, null)],
      asOf,
    );
    expect(r.contacts.map((c) => c.contactName)).toEqual(['Apt AS', 'Østre AS']);
  });

  it('a credit note is a negative receivable that nets the contact down', () => {
    const r = bucketReskontro(
      [item('c1', 'Acme AS', 10_000, '2026-06-30'), item('c1', 'Acme AS', -4_000, '2026-06-30')],
      asOf,
    );
    expect(r.contacts[0]?.totalØre).toBe(øre(6_000));
    expect(r.totalØre).toBe(øre(6_000));
  });

  it('keeps contact-less one-offs separate by name', () => {
    const r = bucketReskontro(
      [item(null, 'Kontant kunde', 1_000, null), item(null, 'Annen kunde', 2_000, null)],
      asOf,
    );
    expect(r.contacts).toHaveLength(2);
  });

  it('the grand total always equals Σ of every item amount (property)', () => {
    const itemArb = fc.record({
      contactId: fc.option(fc.constantFrom('a', 'b', 'c'), { nil: null }),
      contactName: fc.constantFrom('Acme', 'Børre', 'Cd'),
      amountØre: fc.integer({ min: -1_000_000, max: 1_000_000 }).map((n) => øre(n)),
      dueDate: fc.option(fc.constantFrom('2026-06-30', '2026-05-01', '2026-01-01', '2026-06-26'), {
        nil: null,
      }),
    });
    fc.assert(
      fc.property(fc.array(itemArb), (items) => {
        const r = bucketReskontro(items, asOf);
        const expected = sumØre(items.map((i) => i.amountØre));
        expect(r.totalØre).toBe(expected);
      }),
    );
  });
});

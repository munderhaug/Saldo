/**
 * Reporting boundary shapes (feat-reporting). The reports are read-only, so the only untrusted input is
 * the `?year=` query param and the hovedbok account id — validated here, like every other boundary.
 */
import { z } from 'zod';

/** A fiscal year in the supported range. Coerces the `?year=` string; rejects junk. */
export const reportYearSchema = z.coerce.number().int().min(2000).max(2100);

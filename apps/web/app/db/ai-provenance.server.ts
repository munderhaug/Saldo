/**
 * AI provenance persistence — the durable half of EU AI Act Art. 50(2) (ADR 0037; the table lives in
 * `db/migrations/*_ai_provenance.sql`). When a human confirms an AI-proposed value and it posts to the
 * ledger, we write a queryable record that the resulting voucher CAME FROM an AI proposal: model ·
 * modelVersion · confidence, linked 1:1 to the voucher.
 *
 * AI never writes the ledger (ADR 0002): `recordAiProvenance` is called in the SAME transaction as the
 * human-confirmed post (`recordManualVoucher`), so the provenance and the voucher commit atomically —
 * it records that a human committed an AI proposal, it is not an AI write.
 *
 * Data minimisation (`.claude/rules/data-handling.md`): provenance is model/version/confidence + the
 * voucher linkage ONLY — NEVER the supplier (// personal), the amounts (PII), or the image. The pino log
 * line carries exactly the same minimal shape (`aiProvenanceLogFields`, the single definition of what we
 * log). Server-only.
 */
import type { OrgTx } from '../auth/middleware.js';
import { aiProvenance } from './schema.js';

export interface AiProvenanceRecord {
  readonly organizationId: string;
  /** The posted voucher this AI proposal became (1:1). */
  readonly voucherId: string;
  readonly model: string;
  readonly modelVersion: string;
  /** Model's self-reported confidence, 0..1. */
  readonly confidence: number;
}

/**
 * Persist the provenance of a confirmed AI proposal, in the caller's tenant-scoped transaction (RLS
 * scopes it to the org; the append-only grant — INSERT/SELECT, no UPDATE/DELETE — keeps it immutable).
 * `numeric` columns round-trip as strings in Drizzle, so confidence is stringified for storage.
 */
export async function recordAiProvenance(tx: OrgTx, input: AiProvenanceRecord): Promise<void> {
  await tx.insert(aiProvenance).values({
    organizationId: input.organizationId,
    voucherId: input.voucherId,
    model: input.model,
    modelVersion: input.modelVersion,
    confidence: String(input.confidence),
  });
}

/**
 * The exact, minimal fields logged for an AI-assisted post (Art. 50(2) observability, paired with the
 * pino baseline, ADR 0021). This is the SINGLE definition of what reaches the log — model/version/
 * confidence + linkage, NEVER personal data (supplier, amounts, image). The redaction/no-leak test
 * asserts this shape so a future edit can't quietly add a personal field.
 */
export function aiProvenanceLogFields(input: AiProvenanceRecord): {
  readonly event: 'ai-provenance.recorded';
  readonly organizationId: string;
  readonly voucherId: string;
  readonly model: string;
  readonly modelVersion: string;
  readonly confidence: number;
} {
  return {
    event: 'ai-provenance.recorded',
    organizationId: input.organizationId,
    voucherId: input.voucherId,
    model: input.model,
    modelVersion: input.modelVersion,
    confidence: input.confidence,
  };
}

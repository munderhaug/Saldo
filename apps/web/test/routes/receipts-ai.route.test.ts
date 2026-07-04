import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ledgerDbAvailable, startRouteHarness, type RouteHarness } from './route-harness.js';
import { provisionOrg } from './provision.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * Route-level test for the receipts AI provenance GATE — the `confirm` intent of receipts/new, the
 * surface where an AI proposal becomes a ledger post. It locks the EU AI Act Art. 50 / ADR 0002+0037
 * invariant end-to-end through the real withUserOrg tenant transaction:
 *  - a confirmed AI post writes exactly ONE ai_provenance row (model · version · confidence), FK'd to
 *    the posted voucher, in the SAME transaction as the post;
 *  - a confirm that fails to DISCLOSE AI (`aiAssisted` not "true") does not validate — nothing posts,
 *    no provenance;
 *  - if the post itself fails (an under-provisioned org → chart-incomplete), NOTHING is written — the
 *    provenance never lands without its voucher (AI never writes the ledger on its own).
 * The `extract` (LLM) branch needs a stubbed vision model and is out of scope for a Postgres-only suite.
 */
type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<unknown>;

describe.skipIf(!ledgerDbAvailable)('receipts/new — AI provenance gate (confirm intent)', () => {
  let h: RouteHarness;
  let action: Handler;

  beforeAll(async () => {
    h = await startRouteHarness();
    const mod = await import('../../app/routes/orgs.$orgId.receipts.new.js');
    action = mod.action as unknown as Handler;
  });

  afterAll(async () => {
    await h.stop();
  });

  /** A valid AI-confirm body; override any field (drop `aiAssisted` to test the disclosure gate). */
  function confirmForm(over: Record<string, string> = {}): FormData {
    const fd = new FormData();
    const fields: Record<string, string> = {
      intent: 'confirm',
      kind: 'expense',
      amount: '400,00',
      aiAssisted: 'true',
      model: 'qwen2.5-vl',
      modelVersion: 'qwen2.5-vl:7b',
      confidence: '0.9',
      ...over,
    };
    for (const [k, value] of Object.entries(fields)) fd.set(k, value);
    return fd;
  }

  function post(orgId: string, cookie: string, body: FormData, sameOrigin = true) {
    return h.invoke(() =>
      action({
        request: h.request(`/orgs/${orgId}/receipts/new`, {
          method: 'POST',
          cookie,
          body,
          sameOrigin,
        }),
        params: { orgId },
      }),
    );
  }

  async function counts(orgId: string): Promise<{ vouchers: number; provenance: number }> {
    const [v] = await h.ledger.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM voucher WHERE organization_id = ${orgId}`;
    const [p] = await h.ledger.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM ai_provenance WHERE organization_id = ${orgId}`;
    return { vouchers: v!.n, provenance: p!.n };
  }

  it('confirm: posts the voucher AND its provenance atomically, then redirects to the reveal', async () => {
    const orgId = await provisionOrg(h.ledger.sql);
    const cookie = await h.sessionCookie(await h.createMember(orgId));

    const res = await post(orgId, cookie, confirmForm());
    expect((res as Response).status).toBe(302);
    expect((res as Response).headers.get('location')).toBe('/');

    const [voucher] = await h.ledger.sql<{ id: string; type: string; postedAt: string | null }[]>`
      SELECT id, type, posted_at AS "postedAt" FROM voucher WHERE organization_id = ${orgId}`;
    expect(voucher!.type).toBe('purchase');
    expect(voucher!.postedAt).not.toBeNull();

    // Exactly one provenance row, FK'd 1:1 to the posted voucher, carrying only model/version/confidence.
    const prov = await h.ledger.sql<
      { voucherId: string; model: string; modelVersion: string; confidence: string }[]
    >`SELECT voucher_id AS "voucherId", model, model_version AS "modelVersion", confidence
        FROM ai_provenance WHERE organization_id = ${orgId}`;
    expect(prov).toHaveLength(1);
    expect(prov[0]!.voucherId).toBe(voucher!.id);
    expect(prov[0]!.model).toBe('qwen2.5-vl');
    expect(prov[0]!.modelVersion).toBe('qwen2.5-vl:7b');
    expect(Number(prov[0]!.confidence)).toBeCloseTo(0.9, 3);
  });

  it('confirm WITHOUT the AI disclosure ("aiAssisted") fails the gate — nothing posts, no provenance', async () => {
    const orgId = await provisionOrg(h.ledger.sql);
    const cookie = await h.sessionCookie(await h.createMember(orgId));

    const fd = confirmForm();
    fd.delete('aiAssisted'); // the Art. 50(1) disclosure literal is required; absent → schema rejects

    const res = await post(orgId, cookie, fd);
    expect(res).toMatchObject({ ok: false });
    expect(res).toHaveProperty('error');
    expect(res).not.toBeInstanceOf(Response);
    expect(await counts(orgId)).toEqual({ vouchers: 0, provenance: 0 });
  });

  it('confirm on an under-provisioned org leaves NOTHING — provenance never lands without its voucher', async () => {
    const org = await h.seedOrg(); // only accounts 6000/3000 — the posting path needs the full kontoplan
    const cookie = await h.sessionCookie(await h.createMember(org.orgId));

    const res = await post(org.orgId, cookie, confirmForm());
    expect(res).toMatchObject({ ok: false });
    expect(res).not.toBeInstanceOf(Response);
    expect(await counts(org.orgId)).toEqual({ vouchers: 0, provenance: 0 });
  });

  // ── The extract (vision-LLM) branch: auth + rate limit sit IN FRONT of the model call. The model
  //    itself is never reached here — an authenticated member with no file stops at upload validation,
  //    which is exactly the boundary these tests pin (auth → limiter → validation → LLM).

  function extractForm(): FormData {
    const fd = new FormData();
    fd.set('intent', 'extract');
    return fd;
  }

  it('extract: an unauthenticated POST is redirected to login — the LLM branch is never reached', async () => {
    const orgId = await provisionOrg(h.ledger.sql);
    const res = await post(orgId, '', extractForm());
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(302);
    expect((res as Response).headers.get('location')).toBe('/auth/login');
  });

  it('extract: 403 for an authenticated non-member', async () => {
    const orgId = await provisionOrg(h.ledger.sql);
    const cookie = await h.sessionCookie(await h.createMember(null));
    const res = await post(orgId, cookie, extractForm());
    expect((res as Response).status).toBe(403);
  });

  it('extract: a member passes auth and stops at upload validation (no image → form error)', async () => {
    const orgId = await provisionOrg(h.ledger.sql);
    const cookie = await h.sessionCookie(await h.createMember(orgId));
    const res = await post(orgId, cookie, extractForm());
    expect(res).toMatchObject({ ok: false });
    expect(res).not.toBeInstanceOf(Response);
  });

  it('extract: the per-user rate limit refuses the 11th attempt in the window', async () => {
    const orgId = await provisionOrg(h.ledger.sql);
    const cookie = await h.sessionCookie(await h.createMember(orgId));
    const errors: string[] = [];
    for (let i = 0; i < 11; i += 1) {
      const res = (await post(orgId, cookie, extractForm())) as { ok: false; error: string };
      errors.push(res.error);
    }
    // The first 10 attempts reach upload validation; the 11th is refused by the limiter (a different,
    // rate-limit-specific message) — the wall sits per user, in front of the model.
    expect(errors[10]).not.toBe(errors[0]);
    expect(new Set(errors.slice(0, 10)).size).toBe(1);

    // Another user in the same org is NOT throttled by the first user's burst (per-user key).
    const otherCookie = await h.sessionCookie(await h.createMember(orgId));
    const other = (await post(orgId, otherCookie, extractForm())) as { ok: false; error: string };
    expect(other.error).toBe(errors[0]);
  });

  it('confirm: 404 on a non-uuid org id (before auth)', async () => {
    const res = await h.invoke(() =>
      action({
        request: h.request('/orgs/x/receipts/new', { method: 'POST' }),
        params: { orgId: 'x' },
      }),
    );
    expect((res as Response).status).toBe(404);
  });

  it('confirm: 403 (CSRF) on a non-GET with no matching Origin', async () => {
    const orgId = await provisionOrg(h.ledger.sql);
    const cookie = await h.sessionCookie(await h.createMember(orgId));
    const res = await post(orgId, cookie, confirmForm(), false);
    expect((res as Response).status).toBe(403);
    expect(await counts(orgId)).toEqual({ vouchers: 0, provenance: 0 });
  });

  it('confirm: 403 for an authenticated non-member (nothing written)', async () => {
    const orgId = await provisionOrg(h.ledger.sql);
    const cookie = await h.sessionCookie(await h.createMember(null));
    const res = await post(orgId, cookie, confirmForm());
    expect((res as Response).status).toBe(403);
    expect(await counts(orgId)).toEqual({ vouchers: 0, provenance: 0 });
  });
});

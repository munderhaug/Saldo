import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ledgerDbAvailable, startRouteHarness, type RouteHarness } from './route-harness.js';
import { provisionOrg } from './provision.js';

// Needs a real Postgres (Docker/Testcontainers, or SALDO_TEST_PG_URI). Skips cleanly otherwise.

/**
 * Route-level tests for the products CRUD action and the manual-voucher posting action — the two
 * routes review §9 named as untested alongside contacts. Both run through the real withUserOrg
 * auth/tenancy chain and the assertSameOrigin CSRF guard. products/new mirrors contacts/new (parse
 * channel + persistence + tenancy); vouchers/new additionally locks the server-authoritative POST:
 * a confirmed everyday event derives a BALANCED, posted voucher via the rules-validated path.
 */
type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<unknown>;

describe.skipIf(!ledgerDbAvailable)(
  'products/new + vouchers/new — loader + action contracts',
  () => {
    let h: RouteHarness;
    let products: { loader: Handler; action: Handler };
    let vouchers: { loader: Handler; action: Handler };

    beforeAll(async () => {
      h = await startRouteHarness();
      const p = await import('../../app/routes/orgs.$orgId.products.new.js');
      const v = await import('../../app/routes/orgs.$orgId.vouchers.new.js');
      products = { loader: p.loader as unknown as Handler, action: p.action as unknown as Handler };
      vouchers = { loader: v.loader as unknown as Handler, action: v.action as unknown as Handler };
    });

    afterAll(async () => {
      await h.stop();
    });

    function productForm(over: Record<string, string> = {}): FormData {
      const fd = new FormData();
      const fields: Record<string, string> = {
        name: 'Konsulenttime',
        kind: 'service',
        description: '',
        unit: 'time',
        unitPriceKr: '1000',
        defaultAccountId: '',
        defaultVatCodeId: '',
        ...over,
      };
      for (const [k, value] of Object.entries(fields)) fd.set(k, value);
      return fd;
    }

    async function productCount(orgId: string, name: string): Promise<number> {
      const [row] = await h.ledger.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM product WHERE organization_id = ${orgId} AND name = ${name}`;
      return row!.n;
    }

    describe('products/new', () => {
      it('loader: 404 on a non-uuid org id', async () => {
        const res = await h.invoke(() =>
          products.loader({ request: h.request('/orgs/x/products/new'), params: { orgId: 'x' } }),
        );
        expect((res as Response).status).toBe(404);
      });

      it('loader: 403 for a valid user who is not a member', async () => {
        const org = await h.seedOrg();
        const cookie = await h.sessionCookie(await h.createMember(null));
        const res = await h.invoke(() =>
          products.loader({
            request: h.request(`/orgs/${org.orgId}/products/new`, { cookie }),
            params: { orgId: org.orgId },
          }),
        );
        expect((res as Response).status).toBe(403);
      });

      it('action: 403 (CSRF) on a non-GET with no matching Origin', async () => {
        const org = await h.seedOrg();
        const cookie = await h.sessionCookie(await h.createMember(org.orgId));
        const res = await h.invoke(() =>
          products.action({
            request: h.request(`/orgs/${org.orgId}/products/new`, {
              method: 'POST',
              cookie,
              body: productForm(),
              sameOrigin: false,
            }),
            params: { orgId: org.orgId },
          }),
        );
        expect((res as Response).status).toBe(403);
      });

      it('action: invalid input returns a typed {error}, not a throw, and writes nothing', async () => {
        const org = await h.seedOrg();
        const cookie = await h.sessionCookie(await h.createMember(org.orgId));
        const res = await h.invoke(() =>
          products.action({
            request: h.request(`/orgs/${org.orgId}/products/new`, {
              method: 'POST',
              cookie,
              body: productForm({ name: '' }), // name is required
            }),
            params: { orgId: org.orgId },
          }),
        );
        expect(res).toHaveProperty('error');
        expect(res).not.toBeInstanceOf(Response);
        expect(await productCount(org.orgId, 'Konsulenttime')).toBe(0);
      });

      it('action: happy path persists the product and redirects to the list', async () => {
        const org = await h.seedOrg();
        const cookie = await h.sessionCookie(await h.createMember(org.orgId));
        const res = await h.invoke(() =>
          products.action({
            request: h.request(`/orgs/${org.orgId}/products/new`, {
              method: 'POST',
              cookie,
              body: productForm({ name: 'Rådgivning' }),
            }),
            params: { orgId: org.orgId },
          }),
        );
        expect((res as Response).status).toBe(302);
        expect((res as Response).headers.get('location')).toBe(`/orgs/${org.orgId}/products`);
        expect(await productCount(org.orgId, 'Rådgivning')).toBe(1);
      });

      it('action: a member of org A cannot create a product in org B (403, nothing written)', async () => {
        const a = await h.seedOrg();
        const b = await h.seedOrg();
        const cookie = await h.sessionCookie(await h.createMember(a.orgId));
        const res = await h.invoke(() =>
          products.action({
            request: h.request(`/orgs/${b.orgId}/products/new`, {
              method: 'POST',
              cookie,
              body: productForm({ name: 'Cross Tenant' }),
            }),
            params: { orgId: b.orgId },
          }),
        );
        expect((res as Response).status).toBe(403);
        expect(await productCount(b.orgId, 'Cross Tenant')).toBe(0);
      });
    });

    describe('vouchers/new', () => {
      function voucherForm(over: Record<string, string> = {}): FormData {
        const fd = new FormData();
        const fields: Record<string, string> = { kind: 'income', amount: '1000', ...over };
        for (const [k, value] of Object.entries(fields)) fd.set(k, value);
        return fd;
      }

      async function voucherRows(orgId: string) {
        return h.ledger.sql<{ id: string; type: string; postedAt: string | null }[]>`
        SELECT id, type, posted_at AS "postedAt" FROM voucher WHERE organization_id = ${orgId}`;
      }

      it('action: invalid amount returns a typed {error}, not a throw, and posts nothing', async () => {
        const orgId = await provisionOrg(h.ledger.sql);
        const cookie = await h.sessionCookie(await h.createMember(orgId));
        const res = await h.invoke(() =>
          vouchers.action({
            request: h.request(`/orgs/${orgId}/vouchers/new`, {
              method: 'POST',
              cookie,
              body: voucherForm({ amount: '' }),
            }),
            params: { orgId },
          }),
        );
        expect(res).toHaveProperty('error');
        expect(res).not.toBeInstanceOf(Response);
        expect(await voucherRows(orgId)).toHaveLength(0);
      });

      it('action: happy path derives a balanced posted voucher and redirects to the honest-number reveal', async () => {
        const orgId = await provisionOrg(h.ledger.sql);
        const cookie = await h.sessionCookie(await h.createMember(orgId));
        const res = await h.invoke(() =>
          vouchers.action({
            request: h.request(`/orgs/${orgId}/vouchers/new`, {
              method: 'POST',
              cookie,
              body: voucherForm({ kind: 'income', amount: '1000' }),
            }),
            params: { orgId },
          }),
        );
        expect((res as Response).status).toBe(302);
        expect((res as Response).headers.get('location')).toBe('/');

        const rows = await voucherRows(orgId);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.type).toBe('sales');
        expect(rows[0]!.postedAt).not.toBeNull();

        // The deferred SQL triggers guarantee balance + ≥2 postings at commit; assert the shape here too.
        const [legs] = await h.ledger.sql<{ n: number; debit: number; credit: number }[]>`
        SELECT count(*)::int AS n, sum(debit_ore)::int AS debit, sum(credit_ore)::int AS credit
          FROM posting WHERE voucher_id = ${rows[0]!.id}`;
        expect(legs!.n).toBeGreaterThanOrEqual(2);
        expect(legs!.debit).toBe(legs!.credit);
      });

      it('action: 403 (CSRF) on a non-GET with no matching Origin', async () => {
        const orgId = await provisionOrg(h.ledger.sql);
        const cookie = await h.sessionCookie(await h.createMember(orgId));
        const res = await h.invoke(() =>
          vouchers.action({
            request: h.request(`/orgs/${orgId}/vouchers/new`, {
              method: 'POST',
              cookie,
              body: voucherForm(),
              sameOrigin: false,
            }),
            params: { orgId },
          }),
        );
        expect((res as Response).status).toBe(403);
        expect(await voucherRows(orgId)).toHaveLength(0);
      });

      it('action: a non-member cannot post a voucher (403, nothing posted)', async () => {
        const orgId = await provisionOrg(h.ledger.sql);
        const cookie = await h.sessionCookie(await h.createMember(null)); // a user, but not a member
        const res = await h.invoke(() =>
          vouchers.action({
            request: h.request(`/orgs/${orgId}/vouchers/new`, {
              method: 'POST',
              cookie,
              body: voucherForm(),
            }),
            params: { orgId },
          }),
        );
        expect((res as Response).status).toBe(403);
        expect(await voucherRows(orgId)).toHaveLength(0);
      });
    });
  },
);

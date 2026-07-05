/**
 * Altinn 3 MVA-melding **submission** client (feat-altinn-mva-submission, ADR 0063). Drives the
 * captured instance-API sequence in TWO PHASES so the caller can persist the filing pointer between
 * them (the filed-but-unrecorded window shrinks to the instant between instance creation and the
 * DB insert — integration-audit 2026-07-05 #2):
 *
 *  - {@link openMeldingInstance}: exchange the ID-porten token for an Altinn token → create the
 *    instance for the org → return the `{partyId}/{instanceGuid}` pointer + the phase handle.
 *  - {@link completeMeldingInstance}: upload the `mvaMeldingInnsending` envelope + the
 *    `mvaMeldingDto` XML → `process/next` twice (complete data filling, confirm submission).
 *
 * All I/O + Zod validation live here; the domain core makes no external calls. Grounded in the
 * committed capture (`db/reference/skatt/mva-melding/innsending/`), never memory.
 *
 * **Fail-closed.** With the integration off (no EU-residency assertion / endpoint / token — see
 * {@link altinnConfig}) phase 1 returns `not-configured` and makes NO external call. Expected
 * failures (auth/role, the app's 409 validation rejection, network) come back as a typed result,
 * never thrown, so the caller maps them to calm §5.5 copy. Each phase runs under an aggregate
 * deadline (audit #4) — a stalled Altinn can never hold a request (or the caller's tx) for minutes.
 * Filing is EXPLICIT-CONFIRM only — called from the MVA screen's sober submit action, never a loader.
 *
 * **PROVISIONAL until onboarding** (the Altinn 2→3 / systembruker transition is in flux — see the
 * SOURCE.md caution): the data-type query casing (`dataType=mvamelding`) and the prod app id must
 * be re-verified against tt02 before enabling outside test.
 *
 * **Privacy.** The melding carries financial data; on failure we log only the step + status class,
 * never the XML, any figure, or a token.
 */
import { altinnInstance, type AltinnInstance } from '~/contracts';
import { logger } from '~/observability/logger.server';
import { altinnConfig, type AltinnConfig } from './config.server';

type SubmitFailureReason =
  /**
   * `auth-failed` covers a bad/expired token AND a missing Altinn role (upload or signing);
   * `rejected` is the app's validation 409 at a process step; `error` is network/timeout/5xx.
   */
  'not-configured' | 'auth-failed' | 'rejected' | 'error' | 'invalid-response';

/** Phase-1 result: the created instance's pointer + the handle phase 2 continues from. */
export type OpenInstanceResult =
  | {
      readonly ok: true;
      /** Altinn instance linkage — the durable filing pointer, persisted BEFORE phase 2. */
      readonly partyId: string;
      readonly instanceGuid: string;
      /** Opaque continuation for {@link completeMeldingInstance} (token + element id, in memory only). */
      readonly handle: InstanceHandle;
    }
  | { readonly ok: false; readonly reason: SubmitFailureReason };

export type CompleteInstanceResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: Exclude<SubmitFailureReason, 'not-configured'> };

interface InstanceHandle {
  readonly altinnToken: string;
  readonly instanceUrl: string;
  /** The instance-created data element the envelope is PUT onto. */
  readonly envelopeElementId: string;
}

/** Per-call cap; each phase additionally runs under an aggregate {@link Deadline}. */
const CALL_TIMEOUT_MS = 30_000;
/** Aggregate budget per phase (2 calls in phase 1, 4 in phase 2 — audit #4). */
const PHASE_BUDGET_MS = 60_000;

/** A monotonic per-phase budget: each request gets the smaller of the call cap and what's left. */
class Deadline {
  private readonly endAt = Date.now() + PHASE_BUDGET_MS;
  remaining(): number {
    return Math.min(CALL_TIMEOUT_MS, this.endAt - Date.now());
  }
}

/** fetch with abort-on-timeout. Throws on network error / exhausted budget (callers map to `error`). */
async function request(url: string, init: RequestInit, deadline: Deadline): Promise<Response> {
  const budget = deadline.remaining();
  if (budget <= 0) throw new Error('phase deadline exhausted');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budget);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Exchange the ID-porten bearer for an Altinn token (`GET {platform}/authentication/api/v1/
 * exchange/id-porten`). The body is the token — either bare or as a JSON string literal.
 * 401/403 is an auth problem; any other non-ok (platform outage) is `error`, not auth (audit #5).
 */
async function exchangeToken(
  config: AltinnConfig,
  deadline: Deadline,
): Promise<{ token: string } | { reason: 'auth-failed' | 'error' }> {
  const res = await request(
    `${config.platformBaseUrl}/authentication/api/v1/exchange/id-porten`,
    { method: 'GET', headers: { authorization: `Bearer ${config.idPortenToken}` } },
    deadline,
  );
  if (isAuthStatus(res.status)) return { reason: 'auth-failed' };
  if (!res.ok) return { reason: 'error' };
  const body = (await res.text()).trim();
  const token = body.startsWith('"') ? (JSON.parse(body) as string) : body;
  return token ? { token } : { reason: 'error' };
}

/** The auth/role statuses Altinn answers with when the person may not perform the step. */
const isAuthStatus = (status: number): boolean => status === 401 || status === 403;

/**
 * PHASE 1 — exchange the token and create the instance for the org (Altinn checks the person's
 * role here). Off / blocked → `not-configured` with no external call (fail-closed). The caller
 * persists the returned pointer BEFORE running phase 2, so a real filing can never end up
 * unrecorded past the creation instant.
 */
export async function openMeldingInstance(orgNr: string): Promise<OpenInstanceResult> {
  const config = altinnConfig();
  if (!config) return { ok: false, reason: 'not-configured' };
  const deadline = new Deadline();

  try {
    const exchanged = await exchangeToken(config, deadline);
    if ('reason' in exchanged) return { ok: false, reason: exchanged.reason };
    const auth = { authorization: `Bearer ${exchanged.token}` };
    const instancesUrl = `${config.appsBaseUrl}/${config.appId}/instances`;

    const created = await request(
      instancesUrl,
      {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ instanceOwner: { organisationNumber: orgNr } }),
      },
      deadline,
    );
    if (isAuthStatus(created.status)) return { ok: false, reason: 'auth-failed' };
    if (!created.ok) return { ok: false, reason: 'error' };
    const instance = altinnInstance.safeParse(await created.json().catch(() => null));
    if (!instance.success) return { ok: false, reason: 'invalid-response' };

    const envelopeElementId = findInnsendingElement(instance.data);
    if (!envelopeElementId) return { ok: false, reason: 'invalid-response' };

    // The contract pins partyId to digits and the guid to the exact uuid shape, so the pointer is
    // safe to interpolate into instance URLs (audit #3 — never trust an id beyond its parse).
    const [partyId, instanceGuid] = instance.data.id.split('/') as [string, string];
    return {
      ok: true,
      partyId,
      instanceGuid,
      handle: {
        altinnToken: exchanged.token,
        instanceUrl: `${instancesUrl}/${partyId}/${instanceGuid}`,
        envelopeElementId,
      },
    };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export interface CompleteMeldingInput {
  readonly handle: InstanceHandle;
  /** The `mvaMeldingInnsending` envelope XML (pure domain builder). */
  readonly innsendingXml: string;
  /** The `mvaMeldingDto` XML — byte-identical to the download/validation document. */
  readonly meldingXml: string;
}

/**
 * PHASE 2 — upload the envelope onto the instance-created element, add the melding document, then
 * `process/next` twice: complete data filling (the app validates here — 409 = rejected) and
 * confirm. A failure here leaves the caller's already-persisted filing row as the honest trace of
 * the interrupted attempt (the instance keeps living at Altinn).
 */
export async function completeMeldingInstance(
  input: CompleteMeldingInput,
): Promise<CompleteInstanceResult> {
  const { handle } = input;
  const auth = { authorization: `Bearer ${handle.altinnToken}` };
  const deadline = new Deadline();

  try {
    const putEnvelope = await request(
      `${handle.instanceUrl}/data/${handle.envelopeElementId}`,
      {
        method: 'PUT',
        headers: { ...auth, 'content-type': 'application/xml' },
        body: input.innsendingXml,
      },
      deadline,
    );
    if (isAuthStatus(putEnvelope.status)) return { ok: false, reason: 'auth-failed' };
    if (!putEnvelope.ok) return { ok: false, reason: 'error' };

    const postMelding = await request(
      `${handle.instanceUrl}/data?dataType=mvamelding`,
      {
        method: 'POST',
        headers: {
          ...auth,
          'content-type': 'text/xml',
          'content-disposition': 'attachment; filename=mvaMelding.xml',
        },
        body: input.meldingXml,
      },
      deadline,
    );
    if (isAuthStatus(postMelding.status)) return { ok: false, reason: 'auth-failed' };
    if (!postMelding.ok) return { ok: false, reason: 'error' };

    for (const step of ['complete', 'confirm'] as const) {
      const next = await request(
        `${handle.instanceUrl}/process/next`,
        { method: 'PUT', headers: { ...auth, 'content-type': 'application/json' } },
        deadline,
      );
      if (isAuthStatus(next.status)) return { ok: false, reason: 'auth-failed' };
      if (next.status === 409) {
        logger.info({ step }, 'mva-melding submission rejected by the Altinn app');
        return { ok: false, reason: 'rejected' };
      }
      if (!next.ok) return { ok: false, reason: 'error' };
    }

    logger.info({ instanceUrl: handle.instanceUrl }, 'mva-melding submitted to Altinn');
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** The instance-created data element for the `mvaMeldingInnsending` envelope, by data-type name. */
function findInnsendingElement(instance: AltinnInstance): string | null {
  const el = instance.data?.find((d) => d.dataType.toLowerCase().includes('innsending'));
  return el?.id ?? null;
}

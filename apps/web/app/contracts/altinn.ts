/**
 * Altinn 3 instance-API response shapes (feat-altinn-mva-submission, ADR 0063) — the Zod boundary for
 * the MVA-melding submission client (`~/integrations/altinn`). Only the fields the flow actually
 * reads are modelled (`passthrough` semantics by omission): the instance id/party linkage and the
 * created data elements. Grounded in the captured API description
 * (`db/reference/skatt/mva-melding/innsending/2026-07-05-api.html`), never memory.
 */
import { z } from 'zod';

/**
 * One data element on an instance — the innsending envelope element is created with the instance.
 * Its id is PUT-target URL material, so it is pinned to the uuid shape like the instance id.
 */
const altinnDataElement = z.object({
  id: z.string().uuid(),
  dataType: z.string().min(1),
});

/**
 * The created instance: `id` is `"{partyId}/{instanceGuid}"`; `data` lists its data elements.
 * The id is PINNED — numeric party id + an exact uuid — because both halves are interpolated into
 * later instance URLs and persisted: a looser parse would let a hostile response steer follow-up
 * requests (path traversal via `..`, `?`, `#`) or poison the stored pointer.
 */
export const altinnInstance = z.object({
  id: z
    .string()
    .regex(
      /^\d+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      'instance id must be "{partyId}/{instanceGuid}"',
    ),
  data: z.array(altinnDataElement).optional(),
});
export type AltinnInstance = z.infer<typeof altinnInstance>;

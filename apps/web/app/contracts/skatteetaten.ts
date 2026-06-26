/**
 * Skatteetaten MVA-melding **validation API** payload shapes (Zod at the boundary). The validation
 * service returns a `valideringsresultat` document (namespace
 * `no:skatteetaten:fastsetting:avgift:mva:valideringsresultat:v1`) whose `avvikVedMeldingslevering`
 * is the literal `"ingen avvik"` when the melding is accepted, and otherwise carries the deviation(s).
 * Grounded in the committed example (`db/reference/skatt/mva-melding/examples/valideringsresultat.xml`).
 *
 * The XML is parsed to an object at the client boundary, then validated here — the response is never
 * trusted unparsed. `avvikVedMeldingslevering` may be a string or a nested node (the deviation
 * structure), so it is kept `unknown` and normalised by the client. It is REQUIRED: a document with no
 * verdict field is malformed, so it fails the boundary (fail-closed) rather than reading as "approved".
 */
import { z } from 'zod';

/** The `valideringsresultat` document, parsed from XML (the root element unwrapped by the client). */
export const valideringsresultat = z.object({
  avvikVedMeldingslevering: z.unknown(),
});

/** The literal value Skatteetaten returns when there are no deviations. */
export const NO_DEVIATIONS = 'ingen avvik';

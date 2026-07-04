/**
 * Route-param guards — the ONE uuid-shape check for `\$orgId`-style params (review 2026-07-03 §12).
 * A malformed id 404s before any query runs; RLS/membership stay the real authorization.
 */
import { z } from 'zod';

const uuid = z.string().uuid();

/** True when EVERY given routed id is a syntactically valid uuid. */
export function uuidParamsValid(...ids: readonly (string | undefined)[]): boolean {
  return ids.every((id) => uuid.safeParse(id).success);
}

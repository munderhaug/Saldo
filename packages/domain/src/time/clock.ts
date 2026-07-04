/**
 * The domain core is pure: it never reads the wall clock directly. Inject a Clock so logic is
 * deterministic and testable. Production passes a real clock; tests pass a fixed one.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

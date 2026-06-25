/**
 * Keyed microcopy accessor (ADR 0024).
 *
 * `t(key)` returns the Norwegian string for `key` — a typo in the key is a compile error. When the
 * string carries `{name}` placeholders, `t` additionally requires a typed params object with exactly
 * those names, so a missing or misspelled placeholder is a compile error too. `t` is pure (no I/O, no
 * Date/Math): it runs in loaders/actions and in the browser, like @saldo/domain.
 */
import { nb } from './messages';
import type { MessageKey, Messages } from './messages';

export { nb, en } from './messages';
export type { MessageKey } from './messages';

/** Placeholder names (`{name}`) extracted from a template's literal string type. */
type Placeholder<S extends string> = S extends `${string}{${infer P}}${infer Rest}`
  ? P | Placeholder<Rest>
  : never;

/** No placeholders → no params argument; otherwise a record keyed by exactly the placeholder names. */
type ParamsFor<K extends MessageKey> = [Placeholder<Messages[K]>] extends [never]
  ? []
  : [params: Record<Placeholder<Messages[K]>, string | number>];

/** Substitute every `{name}` in `template` from `params`. Throws on an unknown placeholder. */
function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_full, name: string) => {
    if (!(name in params)) throw new Error(`Missing microcopy parameter "${name}"`);
    return String(params[name]);
  });
}

export function t<K extends MessageKey>(key: K, ...args: ParamsFor<K>): string {
  const template: string = nb[key];
  // `args` is a typed tuple (`[]` or `[params]`); the cast bridges the generic conditional to a
  // concrete record. Types guarantee the params are present and complete when one is required.
  const params = args[0] as Record<string, string | number> | undefined;
  return params === undefined ? template : interpolate(template, params);
}

import { useNavigation } from 'react-router';

/**
 * The submit button, pending-aware (review 2026-07-03 §P1): while a navigation/submission is in
 * flight it disables itself and announces busy, so a double-click can't fire the action twice from
 * the UI (the server stays the real guard — locks and guarded UPDATEs; this is UX honesty on top).
 * `useNavigation` is route-global, which is right here: one in-flight mutation at a time per page.
 *
 * Styling stays at the call site via `className` (sites differ: solid/outline, w-fit/w-full) — this
 * component owns only the submit semantics and the pending state.
 */
export function SubmitButton({
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const navigation = useNavigation();
  const pending = navigation.state !== 'idle';
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className={`${className ?? ''} disabled:cursor-default disabled:opacity-60`}
      {...rest}
    >
      {children}
    </button>
  );
}

// shadcn/ui Card — owned in-repo (see .claude/rules/design-system.md). Token-driven; no hardcoded
// colour. React 19 style: `ref` is a normal prop, so no forwardRef.
import { cn } from '~/lib/utils';

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn('bg-card text-card-foreground rounded-xl border shadow-sm', className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col gap-1.5 p-6', className)}
      {...props}
    />
  );
}

function CardTitle({
  className,
  as: Comp = 'div',
  ...props
}: React.ComponentProps<'div'> & {
  /** Render as a real heading (`as="h2"`) when the card title IS the section heading — a styled
   * `<div>` is invisible to screen-reader heading navigation (WCAG 1.3.1, review 2026-07-03 §13). */
  as?: 'div' | 'h2' | 'h3' | 'h4';
}) {
  return (
    <Comp
      data-slot="card-title"
      className={cn('font-text leading-none tracking-tight', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('p-6 pt-0', className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent };

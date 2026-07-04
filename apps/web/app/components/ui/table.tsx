/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- the Table scroll container is the W3C
   scrollable-region pattern: tabindex=0 + role=region + aria-label (WCAG 2.1.1). */
// shadcn/ui Table — owned in-repo. Real semantic <table>/<thead>/<tbody>/<th scope>; figure columns
// add the `tabular` utility + `text-right` at the call site (see .claude/rules/design-system.md).
import { cn } from '~/lib/utils';
import { t } from '~/copy';

function Table({ className, 'aria-label': ariaLabel, ...props }: React.ComponentProps<'table'>) {
  return (
    // The scroll container is keyboard-focusable (tabIndex) so a wide table can be scrolled without
    // a pointer (WCAG 2.1.1, review 2026-07-03 §13); role/label make the region announceable. This is
    // the Deque/W3C scrollable-region pattern — the one legitimate tabindex on a non-interactive role
    // (file-level eslint exception above).
    <div
      data-slot="table-container"
      className="focus-visible:ring-ring relative w-full overflow-x-auto focus-visible:ring-2 focus-visible:outline-none"
      tabIndex={0}
      role="region"
      aria-label={ariaLabel ?? t('common.tableRegion')}
    >
      <table
        data-slot="table"
        className={cn('w-full caption-bottom text-sm', className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('[&_tr]:border-b', className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn('hover:bg-muted/50 border-b transition-colors', className)}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn('text-muted-foreground font-text h-10 px-2 text-left align-middle', className)}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return <td data-slot="table-cell" className={cn('p-2 align-middle', className)} {...props} />;
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('text-muted-foreground mt-4 text-sm', className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption };

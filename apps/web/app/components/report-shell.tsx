/**
 * Shared chrome for the read-only report pages (feat-reporting): the page heading, the fiscal-year
 * line with previous/next-year navigation, and a back link. Each report supplies its own body. Kept
 * deliberately sober — figures are the point, not decoration.
 */
import { Link } from 'react-router';
import { t } from '~/copy';

export function ReportShell({
  title,
  year,
  basePath,
  subtitle,
  backTo,
  backLabel,
  children,
}: {
  title: string;
  /** When set, the header shows the fiscal year with previous/next-year navigation. */
  year?: number;
  /** The route path the year links point at (e.g. `/orgs/123/reports/resultat`). Required with `year`. */
  basePath?: string;
  /** A plain subtitle for point-in-time reports (no year navigation). */
  subtitle?: string;
  backTo: string;
  backLabel: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto grid max-w-3xl gap-6 p-6 sm:p-10">
      <header className="grid gap-2">
        <h1 className="font-serif text-3xl tracking-tight">{title}</h1>
        {year !== undefined && basePath !== undefined ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-muted-foreground text-sm">{t('reports.period', { year })}</p>
            <nav aria-label={t('reports.period', { year })} className="flex gap-4 text-sm">
              <Link
                to={`${basePath}?year=${year - 1}`}
                className="text-primary font-text inline-flex min-h-11 items-center underline-offset-4 hover:underline"
              >
                {t('reports.year.previous')}
              </Link>
              <Link
                to={`${basePath}?year=${year + 1}`}
                className="text-primary font-text inline-flex min-h-11 items-center underline-offset-4 hover:underline"
              >
                {t('reports.year.next')}
              </Link>
            </nav>
          </div>
        ) : subtitle !== undefined ? (
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        ) : null}
      </header>

      {children}

      <p>
        <Link
          to={backTo}
          className="text-primary font-text text-sm underline-offset-4 hover:underline"
        >
          {backLabel}
        </Link>
      </p>
    </main>
  );
}

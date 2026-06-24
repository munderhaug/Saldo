import { Link } from 'react-router';
import type { Route } from './+types/orgs';
import { db } from '~/db/client';
import { requireUser } from '~/auth/auth.server';
import { listOrganizationsForUser } from '~/db/organizations.server';
import { mvaStatusLabel, formatOrgNr } from '~/lib/org-format';
import { t } from '~/copy';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';

export function meta() {
  return [{ title: t('orgs.title') }];
}

/** The org-selection surface: which businesses this user may act for (multi-membership). */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const orgs = await listOrganizationsForUser(db, user.id);
  return { orgs };
}

export default function Orgs({ loaderData }: Route.ComponentProps) {
  const { orgs } = loaderData;
  return (
    <main className="mx-auto grid max-w-2xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-3xl tracking-tight">{t('orgs.title')}</h1>
        <p className="text-muted-foreground">{t('orgs.intro')}</p>
      </header>

      {orgs.length === 0 ? (
        <Card>
          <CardContent className="grid gap-4 pt-6">
            <p className="text-muted-foreground text-sm">{t('orgs.empty.body')}</p>
            <Link
              to="/oppslag"
              className="bg-primary text-primary-foreground font-text inline-flex min-h-11 w-fit items-center rounded-md px-4 py-2 text-sm"
            >
              {t('orgs.empty.cta')}
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {orgs.map((org) => (
            <li key={org.id}>
              <Card>
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div className="grid gap-1">
                    <CardTitle className="font-text text-lg">{org.name}</CardTitle>
                    <p className="text-muted-foreground tabular text-sm">
                      {formatOrgNr(org.orgNr)} · {mvaStatusLabel(org.mvaStatus)}
                    </p>
                  </div>
                  <Link
                    to={`/orgs/${org.id}`}
                    className="border-input font-text inline-flex min-h-11 items-center rounded-md border px-3 text-sm"
                  >
                    {t('orgs.open')}
                  </Link>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Link
        to="/orgs/new"
        className="text-primary font-text inline-flex min-h-11 w-fit items-center text-sm underline-offset-4 hover:underline"
      >
        {t('orgs.create')}
      </Link>
    </main>
  );
}

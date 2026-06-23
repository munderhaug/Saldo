import { Link } from 'react-router';
import { addØre, formatKr, mulRate, rate, øre } from '@saldo/domain';
import { t } from '~/copy';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';

// Demonstrates the shared pure domain core running in a loader (it also runs in the browser).
// All money math uses the domain helpers — no raw arithmetic on Øre (enforced by lint).
export function loader() {
  const net = øre(10000); // 100,00 kr
  const vat = mulRate(net, rate(0.25)); // 25 % MVA
  const gross = addØre(net, vat);
  return { net: formatKr(net), vat: formatKr(vat), gross: formatKr(gross) };
}

export function meta() {
  return [{ title: t('app.name') }];
}

export default function Home({ loaderData }: { loaderData: ReturnType<typeof loader> }) {
  const { net, vat, gross } = loaderData;
  const lines = [
    { label: t('home.demo.netto'), value: net },
    { label: t('home.demo.vat'), value: vat },
  ];

  return (
    <main className="mx-auto grid max-w-xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-3xl tracking-tight">{t('app.name')}</h1>
        <p className="text-muted-foreground">{t('app.tagline')}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('home.demo.title')}</CardTitle>
          <CardDescription>
            {t('home.demo.descPre')}{' '}
            <code className="bg-muted rounded px-1 py-0.5">@saldo/domain</code>
            {t('home.demo.descPost')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableCaption>{t('home.demo.caption')}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t('home.demo.colItem')}</TableHead>
                <TableHead scope="col" className="text-right">
                  {t('home.demo.colAmount')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.label}>
                  <TableCell>{line.label}</TableCell>
                  <TableCell className="tabular text-right">
                    {line.value}&nbsp;{t('common.currency')}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-text">
                <TableCell>{t('home.demo.brutto')}</TableCell>
                <TableCell className="tabular text-right">
                  {gross}&nbsp;{t('common.currency')}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-sm">
        {t('home.next.pre')}{' '}
        <code className="bg-muted rounded px-1 py-0.5">docs/saldo-build-specification.md</code>{' '}
        {t('home.next.post')}
      </p>

      <Link
        to="/orgs"
        className="bg-primary text-primary-foreground font-text w-fit rounded-md px-4 py-2 text-sm"
      >
        {t('home.ctaOrgs')}
      </Link>
    </main>
  );
}

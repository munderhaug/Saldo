import { addØre, formatKr, mulRate, rate, øre } from '@saldo/domain';
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
  return [{ title: 'Saldo' }];
}

export default function Home({ loaderData }: { loaderData: ReturnType<typeof loader> }) {
  const { net, vat, gross } = loaderData;
  const lines = [
    { label: 'Netto', value: net },
    { label: 'MVA (25 %)', value: vat },
  ];

  return (
    <main className="mx-auto grid max-w-xl gap-6 p-6 sm:p-10">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Saldo</h1>
        <p className="text-muted-foreground">
          Regnskap og fakturering for små norske enkeltpersonforetak.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Domenekjernen kjører</CardTitle>
          <CardDescription>
            Den rene <code className="bg-muted rounded px-1 py-0.5">@saldo/domain</code>-kjernen
            beregner 25&nbsp;% MVA på 100,00&nbsp;kr — identisk i nettleseren og på serveren.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableCaption>Beløp i kroner, øre-presist (tabulære tall).</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Post</TableHead>
                <TableHead scope="col" className="text-right">
                  Beløp
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.label}>
                  <TableCell>{line.label}</TableCell>
                  <TableCell className="tabular text-right">{line.value}&nbsp;kr</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell>Brutto</TableCell>
                <TableCell className="tabular text-right">{gross}&nbsp;kr</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-sm">
        Neste steg: Fase&nbsp;0 (se{' '}
        <code className="bg-muted rounded px-1 py-0.5">docs/saldo-build-specification.md</code>{' '}
        §16).
      </p>
    </main>
  );
}

import { addØre, formatKr, mulRate, rate, øre } from '@saldo/domain';

// Demonstrates the shared pure domain core running in a loader (it also runs in the browser).
// All money math uses the domain helpers — no raw arithmetic on Øre (enforced by lint).
export function loader() {
  const net = øre(10000); // 100,00 kr
  const vat = mulRate(net, rate(0.25)); // 25% MVA
  const gross = addØre(net, vat);
  return { net: formatKr(net), vat: formatKr(vat), gross: formatKr(gross) };
}

export function meta() {
  return [{ title: 'Saldo' }];
}

export default function Home({ loaderData }: { loaderData: ReturnType<typeof loader> }) {
  const { net, vat, gross } = loaderData;
  return (
    <main style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: 640 }}>
      <h1>Saldo</h1>
      <p>Accounting &amp; invoicing for small Norwegian enkeltpersonforetak.</p>
      <p>
        Scaffold is in place. The pure <code>@saldo/domain</code> core computes 25% MVA on 100,00
        kr:
      </p>
      <table className="tabular">
        <tbody>
          <tr>
            <td>Net</td>
            <td style={{ textAlign: 'right' }}>{net} kr</td>
          </tr>
          <tr>
            <td>MVA (25%)</td>
            <td style={{ textAlign: 'right' }}>{vat} kr</td>
          </tr>
          <tr>
            <td>
              <strong>Gross</strong>
            </td>
            <td style={{ textAlign: 'right' }}>
              <strong>{gross} kr</strong>
            </td>
          </tr>
        </tbody>
      </table>
      <p style={{ color: '#666' }}>
        Next: run Phase 0 (see docs/saldo-build-specification.md §16).
      </p>
    </main>
  );
}

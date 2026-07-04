/**
 * The reports' total/summary row — one implementation for the balanse TotalRow and the resultat
 * SummaryRow copies (review 2026-07-03 §12). A header cell (`<th scope="row">`) labels the figure;
 * `strong` draws the closing top border (defaults to true — the classic "sum" rule line).
 */
import { TableCell, TableRow } from '~/components/ui/table';
import { Money } from '~/components/money';

export function ReportTotalRow({
  label,
  ore,
  strong = true,
}: {
  label: string;
  ore: number;
  strong?: boolean;
}) {
  return (
    <TableRow className={strong ? 'border-t-2' : undefined}>
      <th scope="row" className="p-2 text-right align-middle">
        {label}
      </th>
      <TableCell className="tabular text-right">
        <Money ore={ore} />
      </TableCell>
    </TableRow>
  );
}

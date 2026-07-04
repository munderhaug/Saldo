/**
 * Shared prelude for parsing the committed SAF-T reference CSVs (tax codes, standard accounts):
 * strip a BOM, split lines, trim, drop blanks, drop the header — the one implementation both
 * parsers use (review 2026-07-03 §10).
 */
export function csvDataRows(csv: string): readonly string[] {
  const lines = csv
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const [, ...rows] = lines; // drop the header
  return rows;
}

/** Split one CSV line on `;`, honouring double-quoted fields (which may contain `;` or `,`). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let inQuotes = false;
  const chars = [...line];
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (ch === undefined) continue;
    if (inQuotes) {
      if (ch === '"') {
        if (chars[i + 1] === '"') {
          field += '"';
          i += 1; // escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ';') {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

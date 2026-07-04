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

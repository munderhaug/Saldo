/**
 * SAF-T validation entrypoint (`pnpm saft:validate`). Generates a SAF-T Financial XML from
 * fixture/seed data and validates it against the official XSD committed under db/reference/saf-t.
 *
 * SCAFFOLD: wired into the build sequence (Phase 8) and CI now so the command and skill exist.
 * Implement generation + XSD validation against `db/reference/saf-t/Norwegian_SAF-T_Financial_*.xsd`.
 */
function main(): number {
  const xsdPresent = false; // TODO: check db/reference/saf-t for the committed XSD
  if (!xsdPresent) {
    console.log(
      'saft:validate — SCAFFOLD. Commit the official SAF-T XSD under db/reference/saf-t and ' +
        'implement generation + validation (see .claude/skills/saft-validate). Skipping for now.',
    );
    return 0;
  }
  return 0;
}

process.exit(main());

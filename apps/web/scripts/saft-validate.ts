/**
 * SAF-T validation entrypoint (`pnpm saft:validate`). When implemented, this generates a SAF-T
 * Financial XML from the ledger and validates it against the official XSD committed under
 * db/reference/saf-t. Phase 8 (compliance hardening).
 *
 * NOT YET IMPLEMENTED. This is a scaffold so the command + skill exist and the build sequence is
 * wired. It reports PENDING and exits 0 (nothing to validate yet) — it does NOT assert that any
 * SAF-T output is valid. Implement generation + XSD validation against
 * `db/reference/saf-t/Norwegian_SAF-T_Financial_*.xsd` (see .claude/skills/saft-validate).
 */
function main(): number {
  console.warn(
    '⚠ saft:validate — NOT YET IMPLEMENTED (scaffold). No SAF-T output is generated or validated. ' +
      'Implement generation + XSD validation against db/reference/saf-t before relying on this gate.',
  );
  return 0;
}

process.exit(main());

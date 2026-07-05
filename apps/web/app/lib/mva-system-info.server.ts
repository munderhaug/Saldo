/**
 * Identity of the generating system (`innsending.regnskapssystem`) for the MVA-melding XML — shared
 * by the download resource route and the Skatteetaten validation action so the validated document is
 * byte-identical to the one the user downloads. The reference is per org+year.
 */
import type { MvaMeldingSystemInfo } from '@saldo/domain';

export function mvaSystemInfo(orgId: string, year: number): MvaMeldingSystemInfo {
  return {
    regnskapssystemsreferanse: `saldo-${orgId}-${year}`,
    systemnavn: 'Saldo',
    systemversjon: '0.0.0',
  };
}

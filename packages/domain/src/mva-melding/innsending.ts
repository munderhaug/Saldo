/**
 * MVA-melding **innsending envelope** serialization (Skatteetaten `mvaMeldingInnsending` v1.0) —
 * the submission-metadata XML uploaded to the Altinn 3 instance ALONGSIDE the `mvaMeldingDto`
 * (feat-altinn-mva-submission, build-spec §8.8/§9). PURE: element names, the namespace, the
 * `periode` choice and every enum are grounded in the committed schema
 * (`db/reference/skatt/mva-melding/innsending/…mvameldinginnsending.v1.0.xsd`), never memorised.
 *
 * Saldo files the ordinary VAT return for an ENK: `meldingskategori` is fixed to `alminnelig` and
 * the submission is always `komplett` (the melding XML rides in the same instance). The term reuses
 * the melding's own {@link MvaTerm} model, so the envelope can never disagree with the melding it
 * wraps about which period is being filed.
 */
import { escapeXml as esc } from '../xml/escape.js';
import { type MvaTerm, periodElementName, periodeValue } from './term.js';

export const MVA_INNSENDING_NAMESPACE =
  'no:skatteetaten:fastsetting:avgift:mva:mvameldinginnsending:v1.0';

/** The envelope's inputs — the org, the term being filed, and the creating system's name. */
export interface MvaMeldingInnsending {
  /** 9-digit organisasjonsnummer (the schema's `norskIdentifikator` choice used by a business). */
  readonly orgNr: string;
  readonly year: number;
  readonly term: MvaTerm;
  /** `opprettetAv` — the creating system, e.g. "Saldo". */
  readonly opprettetAv: string;
}

/**
 * Serialize the `mvaMeldingInnsending` envelope. Element order follows the schema sequence exactly:
 * norskIdentifikator → skattleggingsperiode → meldingskategori → innsendingstype → opprettetAv.
 */
export function buildMvaMeldingInnsendingXml(input: MvaMeldingInnsending): string {
  const el = periodElementName(input.term);
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<mvaMeldingInnsending xmlns="${MVA_INNSENDING_NAMESPACE}">`,
    `<norskIdentifikator><organisasjonsnummer>${esc(input.orgNr)}</organisasjonsnummer></norskIdentifikator>`,
    '<skattleggingsperiode>',
    `<periode><${el}>${esc(periodeValue(input.term))}</${el}></periode>`,
    `<aar>${input.year}</aar>`,
    '</skattleggingsperiode>',
    '<meldingskategori>alminnelig</meldingskategori>',
    '<innsendingstype>komplett</innsendingstype>',
    `<opprettetAv>${esc(input.opprettetAv)}</opprettetAv>`,
    '</mvaMeldingInnsending>',
  ].join('');
}

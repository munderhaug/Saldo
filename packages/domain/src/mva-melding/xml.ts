/**
 * MVA-melding XML serialization (Skatteetaten `mvaMeldingDto` v1.0). PURE: maps the generated
 * {@link MvaMelding} model onto the committed schema's element tree and serializes it. Amounts are
 * rendered in **whole kroner** here — the reporting boundary — via {@link øreToKroner}; the model holds
 * exact øre. Element names, the namespace and the `periode` choice are grounded in the committed schema
 * (`db/reference/skatt/mva-melding/xsd/`), never memorised.
 *
 * Well-formedness is checked separately at the app boundary (fast-xml-parser), exactly as `peppol/ubl`
 * pairs with a boundary check; the model is well-formed by construction here.
 */
import { øreToKroner } from '../money/ore.js';
import { type MvaMelding, type MvaMeldingLine } from './melding.js';
import { periodElementName, periodeValue } from './term.js';

export const MVA_MELDING_NAMESPACE =
  'no:skatteetaten:fastsetting:avgift:mva:skattemeldingformerverdiavgift:v1.0';

/** Identity of the generating accounting system (`innsending.regnskapssystem`). */
export interface MvaMeldingSystemInfo {
  /** Unique reference for this submission in the source system. */
  readonly regnskapssystemsreferanse: string;
  readonly systemnavn: string;
  readonly systemversjon: string;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A whole-kroner amount element (the schema's `Beloep` is decimal; the melding reports whole kroner). */
function kronerEl(tag: string, kroner: number): string {
  return `<${tag}>${kroner}</${tag}>`;
}

function lineXml(line: MvaMeldingLine): string {
  const parts = [`<mvaKode>${esc(line.mvaKode)}</mvaKode>`];
  if (line.grunnlagØre !== undefined)
    parts.push(kronerEl('grunnlag', øreToKroner(line.grunnlagØre)));
  if (line.sats !== undefined) parts.push(`<sats>${esc(line.sats)}</sats>`);
  parts.push(kronerEl('merverdiavgift', øreToKroner(line.merverdiavgiftØre)));
  return `<mvaSpesifikasjonslinje>${parts.join('')}</mvaSpesifikasjonslinje>`;
}

/**
 * Serialize a melding to `mvaMeldingDto` XML. `betalingsinformasjon` is emitted with the KID only when
 * present (a refund carries none). The element order follows the schema sequence exactly.
 */
export function buildMvaMeldingXml(melding: MvaMelding, system: MvaMeldingSystemInfo): string {
  const periode = `<periode><${periodElementName(melding.term)}>${esc(
    periodeValue(melding.term),
  )}</${periodElementName(melding.term)}></periode>`;

  const innsending = [
    '<innsending>',
    `<regnskapssystemsreferanse>${esc(system.regnskapssystemsreferanse)}</regnskapssystemsreferanse>`,
    '<regnskapssystem>',
    `<systemnavn>${esc(system.systemnavn)}</systemnavn>`,
    `<systemversjon>${esc(system.systemversjon)}</systemversjon>`,
    '</regnskapssystem>',
    '</innsending>',
  ].join('');

  // The whole-kroner total must equal the SUM of the rounded line amounts (not the rounded øre total),
  // so the document ties out in kroner — the form the authority reports and validates.
  const fastsattKroner = melding.lines.reduce(
    (sum, l) => sum + øreToKroner(l.merverdiavgiftØre),
    0,
  );
  const grunnlag = [
    '<skattegrunnlagOgBeregnetSkatt>',
    `<skattleggingsperiode>${periode}<aar>${melding.year}</aar></skattleggingsperiode>`,
    kronerEl('fastsattMerverdiavgift', fastsattKroner),
    ...melding.lines.map(lineXml),
    '</skattegrunnlagOgBeregnetSkatt>',
  ].join('');

  const betaling =
    melding.kid !== undefined
      ? `<betalingsinformasjon><kundeIdentifikasjonsnummer>${esc(
          melding.kid,
        )}</kundeIdentifikasjonsnummer></betalingsinformasjon>`
      : '<betalingsinformasjon></betalingsinformasjon>';

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<mvaMeldingDto xmlns="${MVA_MELDING_NAMESPACE}">`,
    innsending,
    grunnlag,
    betaling,
    `<skattepliktig><organisasjonsnummer>${esc(melding.orgNr)}</organisasjonsnummer></skattepliktig>`,
    `<meldingskategori>${esc(melding.kategori)}</meldingskategori>`,
    '</mvaMeldingDto>',
  ].join('');
}

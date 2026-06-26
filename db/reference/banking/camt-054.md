# camt.054 — BankToCustomerDebitCreditNotification (ISO 20022) — the subset Saldo parses (capture)

> **Captured:** 2026-06-26 · **Verify by:** 2027-06-26 (re-check the ISO 20022 catalogue for new versions).
> **Why this file exists:** the XML element names, nesting and the sign convention are NEVER built from
> model memory (hard invariant, AGENTS.md / `.claude/rules/integrations.md`). Saldo's self-built
> camt.054 parser (`apps/web/app/integrations/banking/camt054.server.ts` + the pure normaliser in
> `@saldo/domain/banking`) extracts ONLY the fields recorded here and Zod-validates the shape at the
> boundary. We deliberately parse a documented **subset**, not the whole schema.

## What it is
**camt.054** (`camt.054.001.NN`, *BankToCustomerDebitCreditNotification*) is the ISO 20022 message a
bank sends an account owner to notify **debit and/or credit entries** on an account. It is one of the
cash-management reporting trio: **camt.052** (intraday report) · **camt.053** (end-of-day statement) ·
**camt.054** (debit/credit notification). Saldo accepts camt.054 files exported from a bank for import
into the reconciliation substrate. Versions in field use: `…001.02` (older, e.g. Nordea) through
`…001.08`; the parser keys off **local element names**, so it is version-tolerant across these.

A camt.054 file holds **personal + financial data** (counterparty names, account numbers, message
text) and must stay in the EU/EEA (`.claude/rules/data-handling.md`); it is parsed transiently in the
import action and only the normalised entries are persisted.

## Element hierarchy (the subset Saldo reads)
Tags are ISO 20022 short names. The parser matches on **local name** (namespace-agnostic) and tolerates
missing optional nodes.

```
Document
└── BkToCstmrDbtCdtNtfctn
    ├── GrpHdr
    │   ├── MsgId
    │   └── CreDtTm
    └── Ntfctn                       (notification; 1..n)
        ├── Id
        ├── CreDtTm
        ├── Acct                     (the account these entries belong to)
        │   ├── Id › IBAN  | Id › Othr › Id     (IBAN or "other" account id)
        │   └── Ccy                  (account currency, ISO 4217)
        └── Ntry                     (entry; 0..n — ONE booked posting each)
            ├── Amt  (@Ccy)          (UNSIGNED decimal; currency in the Ccy attribute)
            ├── CdtDbtInd            (CRDT | DBIT — THIS carries the direction/sign)
            ├── Sts                  (BOOK | PDNG; or Sts › Cd in newer versions)
            ├── BookgDt › Dt         (booking date, YYYY-MM-DD)
            ├── ValDt   › Dt         (value date, YYYY-MM-DD)
            ├── AcctSvcrRef          (account-servicer reference for the entry)
            ├── BkTxCd › Domn | Prtry
            └── NtryDtls
                └── TxDtls           (transaction detail; 0..n within an entry)
                    ├── Refs › (MsgId | AcctSvcrRef | EndToEndId | InstrId | TxId)
                    ├── Amt  (@Ccy)
                    ├── RmtInf › Ustrd        (unstructured remittance text; may hold a KID)
                    └── RltdPties › Cdtr|Dbtr › Nm   (counterparty name)
                                  › CdtrAcct|DbtrAcct › Id › IBAN
```

## Sign convention (the one rule that matters for money)
**All `Amt` values are unsigned, non-negative decimals.** Direction is the sibling `CdtDbtInd`:
- `CRDT` → money **into** the account → Saldo stores a **positive** signed amount.
- `DBIT` → money **out of** the account → Saldo stores a **negative** signed amount.

Amounts are decimal strings (e.g. `1234.56`) and are converted to integer **øre** by string assembly —
**never via float** (`.claude/rules/money.md`). The `Ccy` attribute on `Amt` is the entry currency.

## What Saldo extracts → normalised bank transaction
| Saldo field | camt source | Notes |
|---|---|---|
| `externalId` | `Ntry/NtryDtls/TxDtls/Refs/AcctSvcrRef` ▸ `…/EndToEndId` ▸ `…/TxId` ▸ `Ntry/AcctSvcrRef` | first present, in that order; used for idempotent de-dup |
| `amount` (signed øre) | `Ntry/Amt` + `Ntry/CdtDbtInd` | unsigned amount × direction → signed øre |
| `currency` | `Ntry/Amt/@Ccy` (falls back to `Acct/Ccy`) | ISO 4217 |
| `bookingDate` | `Ntry/BookgDt/Dt` | `YYYY-MM-DD` |
| `valueDate` | `Ntry/ValDt/Dt` | `YYYY-MM-DD` |
| `remittanceInfo` | `…/TxDtls/RmtInf/Ustrd` (joined) | free text (**personal data**) — KID extraction is the reconciliation follow-on, not here |
| `counterparty` | `…/RltdPties/Dbtr/Nm` (CRDT) ▸ `Cdtr/Nm` (DBIT) | **personal data** — from the owner's perspective: a CRDT (money in) counterparty is the **debtor** (payer); a DBIT (money out) counterparty is the **creditor** (payee). No cross-fallback (it would surface the owner). |

We import **booked** entries only (`Sts` = `BOOK`); an entry with no `Sts` is treated as booked (a
camt.054 is a debit/credit notification), pending (`PDNG`) notifications are skipped. Saldo's shipped
subset takes **one transaction per `Ntry`** (entry-level `Amt` + `CdtDbtInd`), enriched from the first
`TxDtls`; splitting a batch `Ntry` that bundles multiple `TxDtls` into one transaction per detail is a
reconciliation-era refinement (ADR 0047), not the current behaviour.

## Sources
- ISO 20022 message catalogue — camt.054 (BankToCustomerDebitCreditNotification): https://www.iso20022.org/iso-20022-message-definitions?business-domain=1 (referenced 2026-06-26)
- Bank of America — Reference Guide: Credit and Debit Notification (camt.054): https://images.em.bankofamerica.com/GTS/ISO_20022/ReferenceGuideCreditandDebitNotification(CAMT.054).pdf (fetched 2026-06-26)
- Payments Canada — Usage Guideline camt.054.001.08: https://www.payments.ca/sites/default/files/BankToCustomerDebitCreditNotificationV08(camt.054.001.08).pdf (referenced 2026-06-26)
- Nordea — MIG camt.054.001.02 Credit Notification: https://www.nordea.com/en/doc/nordea-caar-camt.054.001.02-credit-notification.pdf (referenced 2026-06-26)
- camt.052 vs 053 vs 054 (the reporting trio): https://validatefin.com/en/blog/camt-052-vs-053-vs-054 (referenced 2026-06-26)
</content>

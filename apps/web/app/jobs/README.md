# jobs/

Durable background jobs via **graphile-worker**, running on the application's PostgreSQL inside the
persistent Node process (ADR 0010). Payloads never leave the database.

Planned tasks: recurring-invoice generation · reminder/purring cadences · OCR→propose pipeline ·
50k-threshold watcher · MVA-term reminders. Inbound webhooks (bank/PSD2, Vipps, PEPPOL) enqueue here.

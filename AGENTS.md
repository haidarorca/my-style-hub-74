- Order archiving: an order is archived iff `orders.archived_at` is set (never inferred from status); why: status-based archive caused ghost orders.
- Cockpit reminders run server-side (`run_reminder_engine`, pg_cron every 5 min) from current order state, one live reminder per (rule, order); why: survives closed browsers and stays idempotent.

- Translation center: jobs in `translation_jobs`, processed by `/api/public/translation-worker` via a pg_cron job armed on start and unscheduled when idle; per-language hashes in `products.i18n_meta` (manual flag protects user-typed translations); variant option names/values translated once in `translation_dictionary`. Why: resumable background translation without re-translating up-to-date content, and never assuming source text is French.

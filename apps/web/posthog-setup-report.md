<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into Računko, a Slovenian AI accounting SaaS for sole proprietors.

## What was set up

- **`instrumentation-client.ts`** — PostHog client-side initialization using the Next.js 15.3+ approach (no provider needed). Includes automatic error tracking (`capture_exceptions: true`) and EU region routing through a reverse proxy.
- **`next.config.ts`** — Added `/ingest/*` rewrites to proxy PostHog requests through the app (EU region: `eu-assets.i.posthog.com` and `eu.i.posthog.com`), plus `skipTrailingSlashRedirect: true`.
- **`lib/posthog-server.ts`** — Singleton server-side PostHog client using `posthog-node` for API route and webhook event tracking.
- **`.env.local`** — `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` environment variables set.
- **`posthog-node`** — Installed as a dependency for server-side tracking.

## Events instrumented

| Event | Description | File |
|---|---|---|
| `user_signed_up` | User successfully completes registration via Supabase Auth | `app/register/page.tsx` |
| `user_logged_in` | User successfully logs in; `posthog.identify()` called with user ID and email | `app/login/page.tsx` |
| `onboarding_completed` | User finishes onboarding flow; org created, preferences saved; `posthog.identify()` called | `app/onboarding/page.tsx` |
| `invoice_created` | User issues an invoice (status=sent) — core conversion event | `app/invoices/new/page.tsx` |
| `invoice_drafted` | User saves an invoice as a draft | `app/invoices/new/page.tsx` |
| `expense_added` | User manually adds an expense/received invoice | `app/expenses/page.tsx` |
| `receipt_scanned` | AI successfully extracts data from a scanned receipt or PDF | `app/scan/page.tsx` |
| `receipt_saved` | User confirms and saves a scanned receipt; includes `ai_scanned` flag | `app/scan/page.tsx` |
| `organization_settings_saved` | User saves org profile settings (VAT, IBAN, contribution class, etc.) | `app/nastavitve/page.tsx` |
| `stripe_payout_received` | Server-side: Stripe `payout.paid` webhook — auto-invoice created | `app/api/stripe/webhook/route.ts` |
| `stripe_payment_received` | Server-side: Stripe `payment_intent.succeeded` — per-purchase invoice created | `app/api/stripe/webhook/route.ts` |
| `stripe_refund_processed` | Server-side: Stripe `charge.refunded` — credit note created | `app/api/stripe/webhook/route.ts` |
| `ai_chat_message_sent` | Server-side: User sends a message to the AI accountant assistant | `app/api/ai-chat/route.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics dashboard](/dashboard/670144)
- [Signup → Onboarding → First Invoice (Conversion Funnel)](/insights/neEpQ67m) — Core acquisition funnel showing where users drop off
- [New Users & Onboarding Completion](/insights/UbMlYTml) — Daily registrations vs onboarding completions (churn signal)
- [Invoices Created Over Time](/insights/fEq8n2K0) — Daily issued invoices vs saved drafts
- [Expense Tracking Engagement](/insights/ZApa36ad) — Manual additions vs AI receipt scans
- [Stripe Revenue Events](/insights/ONs7KfM4) — Server-side payouts, payments, and refunds

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>

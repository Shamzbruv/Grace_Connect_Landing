# Developer operations

The authenticated portal at `/developer/` includes Sharing Images and Operations.
Content moderators, security administrators and the owner can upload, edit,
disable or remove sharing backgrounds. Uploads accept PNG, JPEG and WebP up to
5 MB and 24 megapixels. New images appear after the app's five-minute cache expires.

Operations shows maintenance job dispatch results, cleanup queues, database size,
moderation backlog and payment configuration. Scheduler success means the job was
dispatched; inspect function logs if a queue does not drain.

## Payments

Server secrets required: `FYGARO_BUTTON_URL`, `FYGARO_KEY_ID`, `FYGARO_SECRET_KEY`,
and `FYGARO_WEBHOOK_SECRET` (or the existing rotation map `FYGARO_WEBHOOK_SECRETS`).
The webhook URL is shown in Operations. Keep credentials in Supabase Edge Function
secrets. Checkout stays disabled until checkout and webhook verification are configured.
A verified successful payment records the event and activates the church's plan.
Redirecting to a success page alone cannot grant access. Verify a provider-approved
test transaction end to end before accepting live payments.

## One-time reset

Only the active super developer can start it, after password verification and an
exact typed confirmation. The account executing it is retained. The action removes
other accounts, churches, application content and uploaded media from Supabase and
the configured private R2 reel bucket. Essential Bible/denomination/policy/feature
definitions remain so the app can operate afterward. The normal scheduled services
may create fresh daily content after cleanup finishes.

Resetting local subscription data does not cancel payment-provider charges.
Provider logs and infrastructure backups retain their own policies.

The reset is consumed immediately and its button disappears permanently. A cron
worker resumes interrupted cleanup. New signups and application writes pause for
at least 16 minutes while old upload URLs expire. The portal displays the phase and
retry status. Do not clear `private.platform_reset_control` or invoke the reset RPCs
manually. The production reset was not activated during implementation or testing.

Regression coverage includes an isolated in-memory Postgres reset harness in the
app repository; it never connects to production.

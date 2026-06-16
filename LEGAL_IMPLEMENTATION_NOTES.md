# Grace Connect Legal Implementation Notes

Updated: June 16, 2026
Owner: Shamar Baker
Company: I Create Solutions & Services
Address: Bull Bay, St Andrew, Jamaica

This ZIP now includes a complete legal center for Grace Connect and updates to both public sign-up forms.

## Pages Added / Updated
- legal.html
- terms.html
- privacy.html
- account-deletion.html
- age-policy.html
- community-guidelines.html
- moderation-policy.html
- data-retention.html
- location-disclosure.html
- donation-refund-policy.html
- pastoral-care-disclaimer.html
- admin-access-policy.html
- security-policy.html
- incident-response.html
- vendors.html
- app-store-disclosures.html
- open-source-notices.html
- support-policy.html
- accessibility.html

## Form Updates
- Member sign-up now requires 18+ confirmation and acceptance of Terms, Privacy Policy, Account Deletion Policy, Community Guidelines, and location notice.
- Church registration now requires 18+ confirmation, Terms/Privacy acceptance, authorized representative confirmation, and admin responsibility agreement.
- Supabase signUp metadata now includes legalAccepted, termsVersion, privacyPolicyVersion, legalAcceptedAt, ageConfirmed, and signupSource fields.

## App Work Still Needed
- The mobile app must provide a real Delete Account workflow. Signing out is not enough.
- Automatic attendance/background location must show the Location Disclosure before permission request.
- App store Data Safety and App Privacy forms must be reviewed against the final compiled app and SDKs before submission.
- Replace privacy/support/security email addresses if you want to use a different official email.

This material is operational drafting, not legal advice. Review with a qualified attorney/data-protection professional before launch.

## Supabase Migration Added
- `supabase/migrations/20260616051000_legal_acceptance_records.sql`
- Creates `public.user_legal_acceptances` to preserve proof of legal acceptance from Supabase auth metadata.
- Adds optional convenience columns to `public.users` if the table exists.
- Adds an auth trigger to copy `legalAccepted`, `legalAcceptedAt`, `termsVersion`, `privacyPolicyVersion`, `ageConfirmed`, `authorizedRepresentative`, and `acceptedLegalDocuments` from sign-up metadata into an auditable table.

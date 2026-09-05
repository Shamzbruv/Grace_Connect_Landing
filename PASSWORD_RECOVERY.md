# Password recovery

Users recover their account at https://graceconnect.love/reset-password.html and then sign into the existing mobile app with their new password. No Android release is required.

## Platform support

Open Developer Portal → Users, find the user, and select the key icon **Create temporary password**. The same action is available in church member details. Verify the requester's identity before sharing the credential privately.

The credential is a **temporary recovery password**, not a mobile sign-in password. The user opens the reset page, selects **I have a temporary password**, pastes it, and chooses a new password. Supabase enforces single use and the configured recovery expiry (currently 3,600 seconds). Issuing it does not change the existing password or send an email. Credentials are not stored in the portal or audit log. Closing the modal removes the displayed credential.

Only active super developers, support developers, and security admins may issue credentials. Only super developers may recover accounts listed in developer_accounts. The backend checks the authenticated identity and live database role, and records the recovery request before generating the credential. Ordinary users cannot invoke this action successfully.

## Supabase configuration

- Site URL: `https://graceconnect.love`
- Recovery email button: `https://graceconnect.love/reset-password.html?token_hash={{ .TokenHash }}&type=recovery`
- Keep mobile authentication callbacks in the redirect allow list; include the production reset and signup completion URLs.
- Never put a personal access token or service-role key in website code. The Edge Function uses its built-in server environment.
- Deploy `supabase/functions/developer-password-recovery/index.ts` with the provided config. It verifies bearer tokens through Auth and authorizes the live developer role itself, including when modern JWT signing keys are in use.

The recovery email uses TokenHash verification so it works across browsers and devices, including when an old mobile app supplies its own redirect. The page waits for a deliberate click before consuming the email token. Legacy implicit recovery fragments are also supported. Browser recovery uses an isolated, memory-only client and cannot replace an existing developer portal session. Refreshing the page loses the in-progress recovery context; request a new link if needed.

## Verification

Run `node --test test/*.test.js` with Node 24 or newer. The recovery tests cover authorization failures, developer-account protection, audit failure, token routing, missing and expired credentials, password matching, session isolation, and the successful reset path.

The opt-in `test/recovery-live.py` creates one synthetic account, tests recovery, rejects replay and the old password, verifies the new password, and deletes the account in a finally block. It sends no emails and keeps secrets only in process memory. Do not run against real member accounts.

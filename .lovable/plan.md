## Context

In the previous turn you confirmed "Permanently delete both accounts", so `it@mrengineers.com` and `pc.1@mrengineers.com` were removed from auth, profiles, and roles. The 400 `invalid_credentials` on login is a direct result — the user simply does not exist anymore.

The existing `handle_new_user()` trigger automatically promotes `it@mrengineers.com` to `admin` whenever the account is (re)created, so we just need to recreate the auth user.

## Plan

1. Recreate the auth user `it@mrengineers.com` with a temporary password via a one-shot SQL migration that inserts directly into `auth.users` (email confirmed, encrypted password). The `on_auth_user_created` trigger will:
   - create the matching row in `public.profiles`
   - insert `admin` into `public.user_roles` (because of the hard-coded rule in `handle_new_user`)
2. Confirm by reading back `auth.users` + `user_roles` for that email.
3. You log in with the temporary password, then change it from the Admin → Users → Reset action.

## Decisions needed from you

- **Temporary password** — what should I set? Suggested: `Admin@12345` (you must change it after first login).
- **Restore `pc.1@mrengineers.com` too?** It was also deleted. I will only recreate it if you say yes (and tell me the password).

Once you confirm the password (and whether to restore the second account), I'll run the migration.

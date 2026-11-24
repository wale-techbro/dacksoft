# Authentication configuration

## Confirmation redirects

Signup sends `emailRedirectTo` to `/auth/callback?next=/onboarding`. The callback exchanges Supabase's one-time PKCE code with the SSR client, stores the session in cookies, then redirects to onboarding. Missing, expired, or invalid codes return to `/login` with a clear error message.

The callback origin uses `NEXT_PUBLIC_SITE_URL` when it is set; otherwise it uses the current browser origin. Set `NEXT_PUBLIC_SITE_URL=https://dacksoft.vercel.app` in the Vercel production environment. Leave it unset for local development, or set it to `http://localhost:3000` locally. This keeps local confirmation links on localhost.

## Required Supabase dashboard settings

In Supabase Dashboard → Authentication → URL Configuration, set:

- **Site URL:** `https://dacksoft.vercel.app`
- **Additional Redirect URLs:** `https://dacksoft.vercel.app/**` and `http://localhost:3000/**`

These hosted dashboard settings cannot be changed from this repository. Apply them manually if they are not already present. Supabase uses the Site URL when an explicit redirect is absent, and `emailRedirectTo` must match an allowed redirect URL. See the [Supabase redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls).

If the Confirm signup email template has been customized to build links from `{{ .SiteURL }}`, ensure its confirmation link preserves Supabase's `{{ .ConfirmationURL }}` (or uses `{{ .RedirectTo }}`) so the requested callback URL is retained.

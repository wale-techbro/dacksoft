# Database

The migrations create tenant-scoped business, inbox, knowledge, integration, and AI execution tables with row-level security and cross-tenant foreign-key checks. The first migration adds the `vector` extension and a 768-dimensional embedding column. It also seeds the isolated `nexastore-demo` tenant and connector. `supabase/seed.sql` adds synthetic customers, orders, and products for local demo use.

The second migration adds owner-only workspace onboarding, user profile creation, indexes, and a private fixed-window AI request limiter. The third creates a private `dacksoft-documents` Storage bucket, tenant-path Storage policies, and `match_document_chunks` for bounded tenant-scoped similarity search.

The app does not use a service-role key. Its API routes use the authenticated user's Supabase client so database RLS remains active. The search function is callable only by authenticated users and checks membership for the requested tenant.

## Local verification

With Supabase CLI v3 and Docker running:

```powershell
supabase start
supabase db reset
supabase test db
```

The reset applies migrations and then loads `supabase/seed.sql`. The pgTAP test checks tenant isolation. Docker is not available in the current environment, so local database and pgTAP execution remain outstanding.

## Hosted verification

Before applying migrations to a hosted project, inspect its existing tables and migration history, confirm it is the Dacksoft project, then apply the repository migrations. Afterward, review Supabase security/performance advisors and verify the API URL and publishable key. The connected Supabase account currently does not expose project `ejnfevuhavepvjplgrrn`, so no hosted database changes have been made.

# Testing

`pnpm test` runs deterministic local unit tests for registered tool dispatch, argument validation, missing records, ORD-1004, return eligibility, synthetic policy search, and duplicate ticket prevention. These tests do not call Bridge and are not live integration verification.

With a local Supabase stack, `supabase test db` runs `supabase/tests/tenant_rls_test.sql` against viewer and agent memberships to check tenant isolation and role write access. The database test has not been run here because Supabase CLI and Docker are unavailable.

`pnpm typecheck`, `pnpm lint`, and `pnpm build` check the app when dependencies are installed. No Playwright end-to-end suite or live Bridge test has been added yet. A live test requires a configured key and a funded Bridge account; record it as a separate provider integration run rather than conflating it with mocked/local tests.

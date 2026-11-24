# Security and privacy

- Keep `BRIDGE_API_KEY` and any Supabase secret or service-role key server-side. The app uses the public publishable key and caller-scoped Supabase sessions.
- AI requests require a verified user and membership in the selected tenant. A Supabase-backed fixed-window limit allows at most 10 requests per user per minute.
- The chat request is schema-validated and length-limited. Tool names are allowlisted, arguments are validated, and tool execution is bounded. The model cannot execute arbitrary code or SQL.
- The demo connector returns synthetic data and is unavailable to production tenants. Production knowledge retrieval filters by tenant membership and document status.
- Uploaded documents are restricted to PDF and TXT, capped at 8 MiB, stored in a private bucket, and addressed under a tenant-specific path. Storage policies and database policies check tenant access.
- Provider logs contain safe trace metadata and sanitized tool steps. Do not log customer messages, API keys, or raw provider responses in production.
- Tenant tables have row-level security; write policies limit writes to owners, admins, and agents. Viewers remain read-only.
- Conversation handoff, assignment, status updates, and agent replies are persisted. The NexaStore demonstration ticket tool is synthetic and keeps its idempotency map in process memory; it is not a production ticketing integration.
- Migrations and pgTAP policy checks still need to run against the intended Supabase project before real customer data is used. The hosted project is not currently accessible through the connected Supabase account.

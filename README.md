# Dacksoft

Dacksoft is an AI customer support workspace with tenant-scoped inboxes, knowledge documents, conversation history, and AI execution traces. The NexaStore connector is a fictional demo populated with synthetic records; it does not connect to a retailer.

## Local setup

Requirements: Node.js 22+, pnpm, Supabase CLI v3, and Docker for the local Supabase stack.

```powershell
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

The dashboard's demo workspace can be explored without credentials. For authenticated features, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`, then run the local stack and apply migrations:

```powershell
supabase start
supabase db reset
supabase test db
```

Set `BRIDGE_API_KEY` for live chat and document embeddings. Keep it server-side. Never put a Bridge credential, Supabase secret key, or service-role key in a `NEXT_PUBLIC_*` variable. The application uses caller-scoped Supabase clients and database row-level security.

After email sign-up and sign-in, a user can create one private workspace. Production workspaces use their uploaded knowledge base; the fictional NexaStore order tools are available only in the demo workspace. Real commerce connectors and customer-facing channel integrations are not included.

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: public publishable key (legacy anon key is accepted as a fallback).
- `BRIDGE_API_KEY`: server-side Bridge key for chat and embeddings.
- `BRIDGE_MODEL`: optional Bridge chat model; defaults to `auto`.
- `BRIDGE_BASE_URL`: optional OpenAI-compatible Bridge URL.
- `BRIDGE_EMBEDDING_MODEL`: optional embeddings model; defaults to `gemini-embedding-2`.

## Included capabilities

- Supabase SSR authentication, one-workspace onboarding, tenant-scoped inbox, persistent conversation history, assignment/status updates, and agent replies.
- Bridge chat with streamed replies, bounded tool calls, saved execution traces, and database-backed per-user request limits.
- Private PDF/TXT knowledge uploads, text extraction, Bridge embeddings, and tenant-scoped vector retrieval.
- Synthetic NexaStore demonstration data and read-only order lookup tools.

See [database notes](docs/DATABASE.md), [Bridge integration](docs/BRIDGE_INTEGRATION.md), [connector architecture](docs/CONNECTORS.md), and [security notes](docs/SECURITY.md).

## Quality checks

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Hosted readiness still depends on applying and checking the migrations in the intended Supabase project, configuring Bridge and Supabase environment variables in the hosting project, and verifying the live flows. This workspace does not contain production credentials.


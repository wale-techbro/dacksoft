# Bridge integration

Reference review based on the official Bridge documentation.

## Implemented

- Chat uses the OpenAI-compatible chat completions API through the server-side OpenAI client.
- Streamed tool-call arguments are assembled by call index. Tool definitions and arguments are validated, and execution is limited to three rounds and six calls per round.
- The app saves sanitized execution traces and provider-reported token usage when present. Provider error messages and credentials are not returned to the browser.
- PDF/TXT knowledge uploads are embedded with `gemini-embedding-2` through `POST /v1/embeddings`, using 768 dimensions and retrieval task types. Vector search is scoped to the user's tenant.

## Live status and limits

- No `BRIDGE_API_KEY` is configured in this workspace. Live authentication, chat, streaming tool calls, embeddings, usage, and billing have not been verified.
- Model usage is displayed only when Bridge returns it. The public completion docs reviewed do not define a stable per-request cost field for the UI.
- Provider rate limits are handled as provider errors; Dacksoft also applies its own Supabase-backed limit of 10 AI requests per user per minute. That SQL function must be applied to the intended project before use.
- Real business connectors are not implemented. Production workspaces can use their own knowledge documents, while NexaStore lookup tools are limited to the synthetic demo tenant.

## Operational settings

- `BRIDGE_API_KEY` must remain server-side.
- `BRIDGE_MODEL` defaults to `auto`; `BRIDGE_BASE_URL` defaults to `https://wekoya-api.wekoya.tech/v1`.
- `BRIDGE_EMBEDDING_MODEL` defaults to `gemini-embedding-2`.
- Provider requests use a bounded timeout, no automatic SDK retries, and a capped tool loop.

## Sources

- [Bridge quickstart](https://bridge.wekoya.tech/docs/start)
- [Bridge tool calling](https://bridge.wekoya.tech/docs/tools)
- [Bridge models](https://bridge.wekoya.tech/docs/models)
- [Bridge streaming](https://bridge.wekoya.tech/docs/streaming)
- [Bridge embeddings](https://bridge.wekoya.tech/docs/embeddings)
- [Bridge errors](https://bridge.wekoya.tech/docs/errors)

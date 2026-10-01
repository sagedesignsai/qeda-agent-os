# External services audit — `.env.local` vs. what the code actually uses

**Status:** first pass complete. Three defects fixed, one provider added, one
environment contract corrected. Remaining work is scoped in §7.

> **Update — Brave Search removed.** After the findings below were written, Brave
> was dropped from the app entirely (§8). F1 and F2 are kept as the record of
> why; F2's fix is now moot because the legacy field it repaired no longer
> exists. Wherever this document mentions Brave as a current provider, it does so
> only in those historical findings.

**Scope:** every credential present in `.env.local`, traced through the code
that claims to consume it, and every service the app advertises in Settings,
traced back to a tool that uses it. The question answered throughout is not
"is the key present?" but "does a code path exist that reads it, and does it
work?"

---

## 1. Method

Three passes, because static reading alone would have produced a wrong answer
twice in this codebase:

1. **Static trace.** Enumerate every `process.env` read, then map the service
   registry (`src/main/services/registry.ts`) and the provider registry
   (`src/main/ai/registry.ts`) to their consumers: agent tools, IPC handlers,
   the Settings UI.
2. **Cross-check against `.env.local`.** Diff the variables the registries
   declare against the variables the environment actually provides. This is
   where the two halves diverged most sharply.
3. **Live probes.** Call the endpoints the findings depend on, using the real
   keys, read-only where possible (`GET /models`, `GET /sandbox`). A documented
   API is not a working API, and one assumption in this repo turned out to be
   wrong (§4, F4).

The build-output guard (`release/app/dist/*`) already existed, so the Jest
suite was runnable without a rebuild.

---

## 2. What the code wires today

Ten services (`registry.ts`) and ten chat providers (`ai/registry.ts`), all
resolvable from encrypted Settings first and `.env.local` second.

| Capability | Service | Env var | Client | Agent tool |
| --- | --- | --- | --- | --- |
| Search | Tavily, Exa, Serper, Firecrawl | `TAVILY_API_KEY`, `EXA_API_KEY(_2)`, `SERPER_API_KEY`, `FIRECRAWL_API_KEY` | `services/search.ts` | `webSearch`, `advancedSearch` |
| Scrape | Firecrawl | `FIRECRAWL_API_KEY` | `services/scrape.ts` | `scrapePage` |
| Docs | Context7 | `CONTEXT7_API_KEY` | `services/docs.ts` | `libraryDocs` |
| Images | Unsplash | `UNSPLASH_ACCESS_KEY` | `services/images.ts` | `findImages` |
| Speech | ElevenLabs, Deepgram, Cartesia | `ELEVENLABS_API_KEY`, `DEEPGRAM_API_KEY`, `CARTESIA_API_KEY` | `services/speech.ts` | `textToSpeech`, `transcribeAudio` |
| Chat | Groq, OpenRouter, Gemini, NVIDIA, Cohere, Gateway, OpenAI, Anthropic, Ollama, **OpenCode Zen (new)** | `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `NVIDIA_API_KEY`, `COHERE_API_KEY`, `AI_GATEWAY_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, — , `OPENCODE_ZEN_API_KEY` | `ai/provider.ts` | — |
| RAG | local sqlite-vec | `EMBEDDING_PROVIDER` / `EMBEDDING_MODEL` / `EMBEDDING_DIM` | `tools/rag.ts` | `indexFile`, `searchDocs`, … |

Architecture worth preserving: the registries are dependency-free data, keys
are resolved in one place (`services/keys.ts`), the HTTP shape is shared
(`services/http.ts`, injectable `fetch`), and the agent sees a normalized result
regardless of vendor. The service layer is in good shape. The problems were all
at the edges — which vendor a tool assumed, and what the environment promised.

---

## 3. Coverage: `.env.local` versus the code

`.env.local` defines **51** variables, all with non-empty values. The two
registries declare 22 env names for them (11 services + 11 providers); **16** of
those are actually set, and **35** of the 51 are read by nothing at all.

| In `.env.local` | Read by the app? | Verdict |
| --- | --- | --- |
| `TAVILY`, `EXA` ×2, `SERPER`, `FIRECRAWL` | ✅ | Working (F3 hardens them) |
| `CONTEXT7`, `UNSPLASH` ×2, `ELEVENLABS`, `DEEPGRAM`, `CARTESIA` | ✅ | Working |
| `GROQ`, `OPENROUTER`, `GEMINI`, `NVIDIA`, `COHERE` | ✅ | Working |
| `OPENCODE_ZEN_API_KEY` | 🆕 **now yes** | Was 100% dead; now a provider (F4) |
| `DAYTONA_*` (×4), `E2B_API_KEY` | ❌ | No sandbox capability exists |
| `QDRANT_URL`, `QDRANT_API_KEY` | ❌ | RAG is local sqlite-vec only |
| `COMPOSIO_API_KEY` | ❌ | No integration/tool catalogue |
| `KERNEL_API_KEY` | ❌ | No browser automation |
| `JULES_API_KEY` | ❌ | No cloud coding-agent handoff |
| `VERCEL_*` ×4, `V0_API_KEY` | ❌ | No deploy / UI-generation tools |
| `APPWRITE_*` ×4, `R2_*` ×5 | ❌ | Local-first app needs no backend |
| `TRIGGER_SECRET_KEY` | ❌ | App has its own task/focus scheduler |
| `BETTER_AUTH_SECRET`, `NODE_ENV` | ❌ | No auth; single-user desktop app |

**Also absent:** `BRAVE_API_KEY` — it was the *only* search backend the headline
`webSearch` tool called (F1). Brave has since been removed entirely (§8).

---


## 4. Findings

### F1 — `webSearch` was hard-wired to Brave · **fixed**

`tools/web.ts` called `braveWebSearch` directly and resolved only
`settings.braveApiKey` / `BRAVE_API_KEY`. On this install that tool — the one
the system prompt tells the model to reach for *first* — returned
*"No Brave Search API key configured"* while four working search keys sat
unused in `.env.local`. The capability was present; the plumbing was wrong.

`webSearch` now resolves every configured provider and walks them
(`resolveSearchCandidates()` → `searchAuto()`), so its only remaining failure
mode is "you configured nothing", which is actionable.

### F2 — the Brave key was invisible to the service registry · **fixed, then moot**

Brave had a dedicated `settings.braveApiKey` field (there is a `braveApiKeySet`
flag on the wire) that predated the generic `serviceKeys` map. `keys.ts` read
only the map, so an install that set Brave in Settings saw it reported as
*unconfigured* — in the service list and to every registry-resolved caller.
Both paths were taught to read both fields, which fixed the symptom. The
underlying cause — one service needing a second home for its key — was removed
along with the service itself (§8).

### F3 — `advancedSearch(provider: "auto")` had no fallback · **fixed**

Auto mode picked the *first* configured provider and returned its error, so a
rate-limited or exhausted-balance Tavily key failed the whole turn even when
Exa and Serper were configured. `searchAuto` now treats a thrown error **and** a
200-with-zero-results as fall-through conditions, and re-throws the real
provider error (with the attempted chain) only after every candidate has failed.

The preference order lived as two independent copies — one in
`tools/services.ts`, one implicit in `tools/web.ts`'s hardcoding. It is now a
single exported constant, `AUTO_SEARCH_ORDER`, in `services/search.ts`.

An explicitly named provider is still honoured exactly: substituting a different
vendor's results for a deliberate instruction would be worse than failing.

### F4 — OpenCode Zen's free tier cannot be called from this app · **provider added, deliberately uncatalogued**

Live probe against `https://opencode.ai/zen/v1`:

| Call | Result |
| --- | --- |
| `GET /models` | `200` — 82 model ids, key valid |
| `POST /chat/completions` (`nemotron-3.5-lightning-free`) | `403 {"type":"FreeTierError","message":"OpenCode's free tier can only be used from within OpenCode"}` |

Zen's catalogue advertises many `*-free` models, but the free tier is
client-locked. Curating them as "free models" would have made
`pickDefaultProvider` — and the model picker — recommend something that 403s on
first use. So `opencode` is registered with `freeModels: []`: selectable
deliberately, never auto-selected, models taken from the live list. The finding
is recorded in the registry so the next person does not "fix" it by adding free
ids.

### F5 — eleven services are held but unwired · **documented, not wired**

`DAYTONA_*`, `E2B`, `QDRANT`, `COMPOSIO`, `KERNEL`, `JULES`, `VERCEL_*`, `V0`,
`APPWRITE_*`, `R2_*`, `TRIGGER`. No module under `src/main` reads any of them.
They are now listed in `.env.example` under an explicit
*"held but NOT read by the app yet"* heading, so the template stops
under-describing the environment. Recommendations in §7.

### F6 — RAG was dead on arrival, and the obvious fix was unsafe · **fixed (§9)**

None of `EMBEDDING_PROVIDER` / `EMBEDDING_MODEL` / `EMBEDDING_DIM` is set in
`.env.local` (only in `.env.example`), so `getEmbeddingModel()` threw and
`indexFile`/`indexDocs` failed. Worse, the two configurations `.env.example`
suggested were both **retired models** (`nvidia/llama-3.2-nv-embedqa-1b-v2` →
HTTP 410, EOL 2026-05-18; `text-embedding-004` → HTTP 404), and setting
`EMBEDDING_DIM` alone would not have helped: the `vec0` table is created at a
fixed width. Now fixed end to end — see §9.

### F7 — pre-existing debt, unrelated to services · **open**

* `npx tsc --noEmit`: 10 errors in `src/hooks/use-documents.ts`, 2 in

## 5. Changes made

| File | Change |
| --- | --- |
| `src/main/services/search.ts` | `AUTO_SEARCH_ORDER`, `SearchCandidate`, `AutoSearchResult`, `searchAuto()` with error + empty-result fall-through |
| `src/main/services/keys.ts` | `settingsServiceKey()` (Brave field unification), `resolveSearchCandidates()` |
| `src/main/tools/web.ts` | `webSearch` → `searchAuto(resolveSearchCandidates(), …)`; Brave client and bespoke error path removed |
| `src/main/tools/services.ts` | `advancedSearch` auto-mode reuses the shared path; duplicate order list and `pickAutoProvider` deleted |
| `src/main/ai/registry.ts` | `opencode` provider (`https://opencode.ai/zen/v1`), no curated free models, caveat documented inline |
| `src/main/ai/agent.ts` | System prompt no longer tells the model `webSearch` is Brave-only |
| `.env.example` | `OPENCODE_ZEN_API_KEY` with the free-tier caveat; new "held but not read" section for the eleven unwired services |
| `src/__tests__/services.test.ts` | 6 `searchAuto` cases (first-wins, 429 fall-through, empty-result fall-through, real-error reporting, empty candidate list) + 3 `resolveSearchCandidates` cases |
| `src/__tests__/provider-registry.test.ts` | Zen descriptor + "never auto-select an uncatalogued provider" |

No new dependencies, no schema or migration changes, no persisted-data writes,
no credentials added to git.

---

## 6. Verification

| Check | Result |
| --- | --- |
| `npx jest services provider-registry` | ✅ 2 suites, **35 tests pass** |
| `npx tsc --noEmit` | 12 errors, **all pre-existing** in `use-documents.ts` / `documents.test.ts`; zero in touched files |
| `npx eslint <touched files>` | ✅ clean, except one **pre-existing** unused const (F7) |
| Live: Zen `/models` | ✅ 200 |
| Live: Zen `/chat/completions` free model | ✅ 403 `FreeTierError` — the F4 evidence |
| Live: `api.daytona.io` | 301 redirect, then DNS flaked before the shape could be confirmed |

---

## 7. Planned — ranked by value per unit of risk

Nothing below is started. Each is scoped to the existing service-layer pattern
(injectable `fetch`, key resolved in one place, tool registered in
`tools/index.ts` **and** classified in `policies/chat.ts`, or the
`agent-capabilities` exhaustiveness test fails the build).

1. **Cloud sandbox execution — Daytona, then E2B.** The largest unused asset,
   and the one the product most obviously wants: run code off the user's
   machine. `POST /sandbox` is confirmed against Daytona's docs; command
   execution lives behind the Toolbox proxy (`POST /process/execute`) whose
   public URL shape I could **not** verify — DNS flaked and I would not ship an
   unverified endpoint. Decide SDK vs. proxy URL first. Classification:
   `cost` → `user-approval` (it burns a paid quota and creates remote state).
2. **F6 embeddings, done safely.** ~~Requires choosing a model whose dimension
   matches, or a re-index path.~~ **Done (§9)** — a model was found that emits
   the existing 1536 width on request, so no re-index was needed.
3. **Jules handoff** (`tools/`): delegate a repo task to a cloud coding agent.
   Plain REST, but it needs a connected GitHub repo, and the `.env.local` GitHub
   credentials are a *GitHub App* (app id + private key), not a user PAT — the
   repo connection flow is the real work.
4. **Kernel browser automation**: a `browser*` tool family. Broad capability
   increase, so it deserves its own spec section in
   `docs/agent-tooling-spec.md`.
5. **Composio**: hundreds of third-party tools. Worth a deliberate decision on
   whether the app wants a general integration surface; if yes, it changes the
   tool-approval story more than any other item here.
6. **Qdrant**: only if the local sqlite-vec index stops being enough (sync
   across machines, larger corpora). Today it is a second vector store to keep
   consistent, not an upgrade.
7. **Vercel / v0 / Appwrite / R2 / Trigger.dev**: recommend *not* wiring. A
   local-first desktop app has its own DB, scheduler and filesystem; these
   would add a backend to maintain without changing what the user can do.

### Open decisions for you

* **Zen**: is that account funded? If yes, the provider is immediately useful.
  If no, it stays inert and could be removed from the registry.
* **Sandbox**: SDK dependency (`@daytona/sdk`, pure JS) or hand-rolled REST?
  The SDK is safer but adds a dependency to a repo that currently has none for
  this, and must go through the normal install path.
* **Brave**: ~~keep it as a registry entry at all?~~ **Decided: removed** (§8).

### One security note

`.env.local` is correctly gitignored and untracked, so nothing has leaked. It
does, however, hold live production credentials in plaintext on disk —
including a **GitHub App private key** and S3/R2 secret keys. Worth confirming
the file's permissions and that it never lands in a backup or a synced folder.

---

## 8. Brave Search removed

Brave was dropped from the app, end to end — the only service ever to hold a
second, legacy home for its key.

**Why it was safe to delete rather than deprecate.** Nothing else depended on
it: `webSearch` had already been re-plumbed onto `searchAuto`, so the search
path is `services/search.ts` alone, and `resolveSearchCandidates()` reads keys
from the registry. Removing a registry entry removes the capability from every
consumer at once — there is no second call site left to go stale.

**What was removed**

| Layer | Change |
| --- | --- |
| `services/registry.ts` | the `brave` entry (so it leaves the Settings list and the tool surface together) |
| `services/search.ts` | `'brave'` from `SearchProvider`, `SEARCH_PROVIDERS`, `AUTO_SEARCH_ORDER`, plus the adapter and its dispatch case |
| `tools/brave-search.ts` | deleted — the standalone client existed only for this path |
| `ai/settings.ts` | the `braveApiKey` field and both of its crypto passes |
| `ipc/channels.ts`, `ipc/handlers/settings.ts` | `braveApiKeySet` on the read shape; the bespoke merge rule on save |
| `settings-store.tsx`, `ModelsView.tsx` | the dedicated "Brave Search API key" input, its state, its payload, and the `service.id !== 'brave'` filter that hid Brave from the service list |
| `.env.example` | `BRAVE_API_KEY` |
| `__tests__/brave-search.test.ts` | deleted with the client |
| `__tests__/settings-dialog.test.tsx` | its two key-handling cases were re-pointed from the Brave field to a service key, which tests the same behaviour |

**Search now runs on four backends** (Tavily, Exa, Serper, Firecrawl), and
`searchAuto` walks whichever of them the user has keyed. On this install that is
still four working providers, so the capability is unchanged in practice.

**Persisted data.** An existing `settings.json` may still contain a
`braveApiKey` entry. It is now inert: nothing reads it, and it is no longer
encrypted on the way back out because the field is not part of `AppSettings`
anymore. It was deliberately **not** auto-deleted — silently discarding a
credential the user typed is worse than leaving an unread one. Remove it by
hand, or re-enter Settings and clear the field.

**Verification.** The full suite was run against `HEAD` in a throwaway worktree
and against this tree: **54 passing suites in both**, and the same failing set
(`active-launchpad`, `agent-capabilities`, `app-sidebar-project`,
`copilot-tools`, `repo-tools`, `sidebar-model-readout`) — all failing on
pre-existing issues, mostly the unmocked ESM `ai` package. `onboarding` failed
once under full-suite parallel load and passes 3/3 in isolation; it asserts a

## 9. RAG switched on (F6 closed)

Five shipped tools — `indexFile`, `indexPage`, `searchDocs`, `listIndexed`,
`removeFromIndex` — could not run. Not misconfigured: **structurally broken**,
plus pointed at dead models.

**The three defects**

1. **A chat model was being used to embed.** `getEmbeddingModel()` returned
   `resolveModel(...)`, typed `LanguageModel`. `embed()`/`embedMany()` call
   `doEmbed` on what they are given and a chat model has no such method, so every
   RAG tool failed at runtime *however correct the configuration was*. A cast
   (`as Parameters<typeof embedMany>[0]['model']`) had been hiding the type
   error. Fixed by `resolveEmbeddingModel()` in `ai/provider.ts`, which calls
   `.embeddingModel(modelId)`; chat and embeddings now share one construction
   path so they cannot drift again.
2. **Both documented models were retired.** Verified live:
   `nvidia/llama-3.2-nv-embedqa-1b-v2` → **410 Gone, EOL 2026-05-18**;
   `text-embedding-004` → **404** on the OpenAI-compat route *and* on the native
   `embedContent` route.
3. **Nothing could pin a width.** The `vec0` table is created at a fixed
   `EMBEDDING_DIM` (1536) and cannot be resized, so a wrong-width vector is a
   corrupt index, not a recoverable error.

**The model that fits: `gemini/gemini-embedding-001`.** It emits 3072 by default
but **exactly 1536 when asked** — matching the existing index, so **no re-index
and no `EMBEDDING_DIM` change**. End-to-end proof through the app's own provider
construction and the AI SDK's `embed()`:

| Request | Vectors returned |
| --- | --- |
| default | 3072 (would be refused) |
| `providerOptions: { gemini: { dimensions: 1536 } }` | **1536 — fits** |

**What was added**

| File | Change |
| --- | --- |
| `ai/embedding-config.ts` *(new)* | curated models with verified widths, the Settings → env → auto resolution order, the width guard, and two error types that say what to do |
| `ai/provider.ts` | `resolveEmbeddingModel()`; shared `requireProvider` / `requireApiKey` / `openAICompatible` helpers |
| `db/client.ts` | `getEmbeddingDim()` — the width the index *actually* has, not a re-read of the env |
| `tools/rag.ts` | `getEmbeddingContext()`; width asserted **before** any insert; errors surfaced as configuration, not `String(err)` |
| `tools/workspace-rag.ts` | same fix for `indexPage`, which had the identical broken call |
| `EmbeddingsView.tsx` | "Recommended for your keys" — one click per curated model, showing which one fits any index |
| `.env.example` | dead suggestions replaced with the verified one, and an explicit "verified dead, do not use" list |

**Deliberate choices**

* **Auto-selection only picks a model whose width was measured.** NVIDIA's live
  ids are listed as choices but never auto-selected, because guessing a width is
  exactly the failure this work removes.
* **A mismatch is refused, not written.** If someone configures a 3072 model
  against a 1536 index, the error names both numbers, the model that would fit,
  and the `EMBEDDING_DIM` value to re-index with. This is what the Settings
  dialog already promised: *"A mismatched width is reported as a
  configuration error rather than failing at query time."* Until now, nothing
  implemented that sentence.

**Verification:** 15 new unit tests on the pure config layer; `tsc` back at its
pre-existing baseline of 12; `eslint` clean on every file touched (the one
remaining error in `EmbeddingsView` is the pre-existing `promise/always-return`
on its provider fetch, unchanged from `HEAD`); full suite **58 passing**, with
the failing set a strict subset of the `HEAD` baseline — no new failures.

**Still true:** `agent-capabilities`, `copilot-tools` and (intermittently)
`repo-tools` cannot run under this Jest config because `ai` and
`@ai-sdk/gateway` are ESM-only and unmocked. That is why the decisions above
live in a pure module that *can* be tested.

`settings:save` payload of `{ onboardingCompleted: true }` and does not touch
keys, so that is a load-induced flake, not a regression. Six pre-existing lint
errors in the touched files dropped to five; the five that remain are unchanged
from `HEAD`.

---


For the record, since the brief was to replace or enhance: no client needed
replacement. `services/http.ts` (friendly status→message mapping, injectable
fetch, injectable binary bodies), the normalized `SourceResult` shape, the
dependency-free registries, and the Settings-first key precedence are all
sound. The defects were orchestration-level, not client-level.

  `src/__tests__/documents.test.ts` (PDF block unions). Untouched by this work.
* `MAX_FETCH_CHARS` in `tools/web.ts` is assigned and never read (confirmed
  present-and-unused at `HEAD`). It is the same `24_000` the `fetchUrl` schema
  already defaults to, so the constant is dead weight.

---

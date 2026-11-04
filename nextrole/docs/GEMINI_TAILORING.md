# User-owned Gemini tailoring

The public static app now uses optional user-owned Gemini keys rather than a shared owner key. No hosted inference service, new provider account, paid fallback or platform login is required. The existing local Python/Gmail backend is unchanged.

## Flow
1. Job details → Tailor resume with Gemini.
2. Connect a key from the user’s own free-tier project. The password input is cleared; the secret remains in a closure until Disconnect or tab unload.
3. Explicit consent identifies Google, the resume, job and approved answers. The UI explains free-tier data use and requires the user to check that billing is disabled.
4. One structured full-resume review maps requirements, optional evidence questions, a summary and role/project ordering. Quotes are validated and hidden behind explanations.
5. The user may approve up to three missing facts, attached to their original accomplishment. Skipping is supported.
6. All parsed editable blocks are split into at most two generation batches, each followed by a factual audit if edits exist. No single-accomplishment selector is required. The full workflow uses at most five provider calls.
7. Show only visible, validated changes. Individual approvals, Apply all compatible changes and a final download review are supported. Summary alternatives cannot conflict with edits to the old summary.
8. Only the download draft changes. Original matching text, name, contact lines, employer/role/date headers, education and certification sections stay protected. Bullet reordering is constrained to the same role; projects move as whole blocks; employment chronology does not change.

## Usage and security
Model: gemini-3.1-flash-lite, minimal thinking, structured JSON, bounded output. The fixed HTTPS generateContent endpoint uses x-goog-api-key, never a query-string secret; cookies/referrers/caching/redirects are disabled. No tools or grounding requests.

Local counters: 3 reviews and 15 requests per browser/key per UTC day, max 5 requests per review, max 3/minute and 21 seconds between requests. Web Locks serialize quota updates across tabs where supported. Failed attempts count. Cached outputs do not make new requests. A 60-second request timeout, 24,000-character resume and 16,000-character job limits, 120,000 input-content characters per review and no automatic retries constrain use. Long content is rejected rather than silently truncated. Keys, resumes and model outputs are not stored in quota records. Counters are not included in portable backups.

These controls are local safeguards, not a server-enforced or provider-wide financial cap. Clearing storage, using another device or calling the API elsewhere can bypass them. Google project quotas and billing settings remain authoritative; use billing-disabled free-tier projects for no-charge use. Google may use free-tier input/output to improve products. Source: https://ai.google.dev/gemini-api/docs/pricing and https://ai.google.dev/gemini-api/docs/rate-limits.

## Validation and limits
Deterministic checks require exact source originals, real job quotes, visible changes, unchanged numbers/links/recognized tools/proficiency/ownership claims and protected name tokens. A second Gemini pass must mark each edit faithful. Unsupported requirements become Unclear; missing qualifications never become resume claims. These checks reduce errors but are not proof of truth or employer ATS certification. Failed workflows leave the draft untouched.

Calibri Word exports try the selected size then smaller readable sizes down to 10 pt; overflow is blocked without deletion. Browser layout is not a Word renderer; the existing optional LibreOffice companion remains available for actual PDF page/text checks.

Tests: test-gemini-client.mjs, test-gemini-tailoring.mjs, plus existing export, role matching, draft and public boundary checks. qa/gemini-tailoring.html is a fictional mocked-provider browser fixture; it is not part of the published source checkout or deployment. A live provider test requires the user to enter a private key and consent in their browser.

## Supported job-description keywords

Tailoring now covers the summary, comma-separated skills and relevant accomplishment blocks. Every introduced job term must carry a verbatim job quote and a resume quote; role-bullet evidence stays anchored to that accomplishment, while skill and summary suggestions can draw on the current reviewed draft. Validated acronym equivalents such as ML/machine learning and PostgreSQL/Postgres are recognized. New named technologies require explicit source evidence; a generic cloud task cannot establish AWS. General capability wording such as process automation requires actual supporting tasks and a separate semantic audit. Skills retain original entries and proficiency caveats.

Suggestions remain opt-in and display before/after text; their supporting keywords appear under Why this change. Repetition guards reject keyword stuffing within a suggestion and excessive combined repetition. The unchanged five-request review budget includes generation and factual audits. Current matching resume content is not replaced by tailoring. Failed or unsupported suggestions are not applied. This adapts the contextual keyword principle in https://resumly.in/ats-friendly-resume, without adopting guaranteed ATS-score or selection claims.

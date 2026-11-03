# No-cost public rollout — October 28, 2026

No paid hosting, database, subscription, AI billing, or shared Gemini key was activated. This update uses the existing published static site and client-side code. The hosting platform remains subject to the owner’s existing plan and limits; this is not a promise that any provider will remain free forever.

## Available without a new service

- Upload/read resumes and retain the original in browser storage.
- Review extracted contact, work and education facts; save to the approved Edge extension.
- Compare pasted descriptions against recognized resume keywords locally, with exact source excerpts. This is keyword evidence, not semantic matching or full qualification review. Negated/limited mentions require user review; missing skills are never inserted.
- Format skills and spacing in a separate editable download draft. The matching resume is not replaced.
- Generate a Calibri DOCX draft locally, preserving source text/order. Browser fit checks block obvious overflow at the selected 10–11 point body size. Actual Word pagination is unverified; open the result before applying. Verified server-side one-page export is a separate unavailable capability. Print / Save PDF uses the browser print dialog and its page count.
- Track applications/referrals, change statuses, search company/role/job ID and download/restore a local backup. Restoring does not overwrite existing IDs. No Gmail access or automatic status inference occurs.
- Search external job sites using the visitor’s chosen keywords and location.
- Public onboarding, privacy notice, support links and safe service-unavailable messages.

## Not enabled

1. Continuous multi-company scraping and background recommendation refresh. Reliable always-on workers, persistent shared job storage and network capacity can require hosting spend. Free host tiers exist but sleep, expire or impose quotas; no such account or resource was created.
2. Shared public Gemini rewriting/semantic qualification reviews. Gemini has model/region-dependent free API quotas, so AI is not inherently paid. Those quotas do not guarantee public availability. We have not exposed a key or enabled billing or fallback to paid requests. Existing local AI use is unchanged.
3. Guaranteed server-rendered one-page Word checks. The local implementation uses Windows Word automation; production needs an appropriate renderer plus hosting/operations. Local Word draft generation is available without a backend but is not a substitute for rendered Word verification.
4. Gmail server sync and background interview-email notifications. Public Gmail readonly access is a restricted scope and needs verification unless an exception applies. Google states server storage/transmission of restricted scope data requires a security assessment. No public OAuth credentials, mailbox tokens or shared local mailbox were exposed.
5. Cloud accounts, cross-device sync and durable cloud backups. These can have limited free tiers but introduce provider setup, quotas and ongoing operational obligations. Browser-local storage and user-owned backup files are provided instead.

## Reference documentation

- Gemini free and paid tiers: https://ai.google.dev/gemini-api/docs/pricing
- Gmail restricted scopes: https://developers.google.com/workspace/gmail/api/auth/scopes
- Example free-hosting limits: https://render.com/docs/free

## Verification

Local regression checks cover keyword/source evidence, unchanged approved text, DOCX ZIP/XML integrity and Calibri declarations, unsafe URL rejection, backup validation and no service calls in the browser-only modules. The existing local application tracker, public copy and autofill checks are retained. No paid-service or mailbox test is needed for this release.

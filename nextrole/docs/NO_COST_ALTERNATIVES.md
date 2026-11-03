# No-cost alternatives implemented — October 28, 2026

## Public listings and ranking

`.github/workflows/public-jobs.yml` in H-ana/NextRole uses a standard ubuntu-latest runner only when the repository is public. It has a manual trigger, a source-change trigger and a four-hour schedule, a 25-minute timeout and concurrency protection. It writes only `nextrole/dist/public-jobs.json`. No personal credentials or paid APIs are used. The isolated stdlib collector in `nextrole/public_feed` uses configured employer careers sources, rotates up to 36 sources per run and respects the existing crawler rules/access failures. Its exported field allowlist excludes applicant input and manual/platform imports. No one should put resumes or mailbox files in this directory.

The browser reads that public feed and a bundled seed; a source refreshed in the remote feed supersedes its bundled entries, including closures. Other bundled sources remain until checks age out after seven days. Missing jobs from incomplete scans are handled by the collector's existing bounded cache rules. Last-checked times are preserved; retrieval is never claimed to be a new posting date. Coverage is partial and source-dependent, not a guarantee of every job at every employer.

Existing employer allowlist, strict quoted experience bands, selected cities, work style and posting checks remain in the recommendation path. Unknown experience is excluded. Browser relevance is not an eligibility score. Ranking uses keywords by default. Opting into the local MiniLM model enables 80% cosine similarity / 20% keyword coverage, with up to 250 filtered candidates reranked and 100 shown. Model failure falls back visibly to keyword matching. The model uses Transformers.js 3.8.1, WASM and a quantized Xenova/all-MiniLM-L6-v2 download; worker execution keeps inference off the main UI thread. Resume text is not included in feed/model URLs or requests.

## Optional local AI

Resume tools can download WebLLM 0.2.85 and the Qwen2.5-0.5B-Instruct-q4f16_1-MLC model. WebGPU, model-host access and sufficient GPU memory are required. It is opt-in, runs in a worker and can be stopped/unloaded. No Gemini key, cloud inference, paid fallback, or new extension permissions are involved. Weight caches can survive unloading; users can clear browser data.

Suggestions are limited to a selected existing accomplishment bullet. A second local model call checks factual equivalence. If free rewording fails, the model can choose among prevalidated, first-verb synonym variants that preserve all remaining text literally; a deterministic factual check validates that choice. A deterministic conservative gate then rejects changed numbers, proficiency/negation/ownership claims, added/removed content words and unsupported substitutions. Names, role headers, qualifications and dates cannot be selected as bullets. Every acceptable suggestion still needs explicit user review and selection. Source/draft/job changes invalidate pending suggestions; failure leaves the draft intact. This intentionally permits fewer edits than unrestricted generative rewriting.

## Documents

Existing browser Word/text exports and Print / Save PDF remain. The optional `nextrole-local-renderer.zip` contains a Python companion and setup instructions, not LibreOffice or fonts. The user installs LibreOffice and pypdf locally. It runs without an HTTP listener or cloud requests, renders to a temporary profile, blocks PDFs other than one page, compares extracted text/order against approved DOCX text and writes only a new requested PDF after validation. It does not overwrite an existing PDF. This checks LibreOffice output, not Word pagination or employer ATS behavior. Calibri may be substituted if unavailable; no proprietary fonts are redistributed.

## Portable storage

Backup & move devices exports an AES-GCM encrypted JSON backup. PBKDF2-SHA256 (310,000 iterations, random 16-byte salt), AES-256-GCM and a random 12-byte IV are used; a password of at least 12 characters is required. Passwords are not saved and cannot be recovered. The fixed field allowlist includes original website resume text, the matching retained file if present, reviewed autofill profile, preferences, saved job IDs and local application records. It excludes Gmail credentials, unrelated browser storage and extension-private documents. Restore validates data and requires explicit replacement approval, rolls back on storage failure, and offers a reload. Extension Save to extension is required separately after restoration.

Users can move the encrypted file through their personal cloud drive. No cloud account is connected, no cloud upload occurs automatically and no background multi-device synchronization is promised.

## Gmail and costs

Gmail behavior was left unchanged. No email import or syncing alternative was added. No new paid infrastructure, subscription or AI billing was activated. Public GitHub Actions standard runners are currently free; hosting, models, CDNs, device resources and scheduling remain subject to their own availability, policies and limits. This is not an unlimited-service guarantee.

## References

- https://docs.github.com/en/actions/concepts/billing-and-usage
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
- https://huggingface.co/docs/transformers.js/en/index
- https://webllm.mlc.ai/docs/user/get_started.html
- https://www.libreoffice.org/

Verified first GitHub refresh: https://github.com/H-ana/NextRole/actions/runs/40689353988 (success; first bounded batch, not complete coverage). Real browser tests completed MiniLM semantic matching over 40 experience/location-filtered jobs, local model initialization and a reviewed supported wording option, and encrypted backup generation. LibreOffice is not installed in the tool session: PDF one-page/text validation was exercised on synthetic PDFs, not a real LibreOffice conversion here.

# NextRole

Local resume-based job discovery with company careers-page scraping, local semantic ranking, optional Gemini fit review, and fact-preserving ATS resume suggestions with Word export.

## Start

Python 3.12+ runs the backend and public-feed cache. The local embedding model needs a one-time setup:

```powershell
cd C:\Users\hp\jobapply\nextrole
python setup_semantic.py
python start_agent.py
```

Setup installs NumPy, ONNX Runtime and Tokenizers into `.local-deps/`, then downloads the pinned Apache-2.0 `sentence-transformers/all-MiniLM-L6-v2` tokenizer and roughly 23 MB quantized ONNX model into `.models/`. The model download is checksum-verified. It does not upload applicant documents. Setup performs a synthetic similarity check. Subsequent ranking runs locally and requires no model API calls or network downloads.

Collection is currently set to **HTML-only** in `scraping_settings.json` (`"mode": "html"`). No Playwright or Chromium installation is needed. The collector does not import or launch a browser in this mode, even if one is installed. Server-rendered careers pages and embedded JobPosting JSON-LD are supported; JavaScript-only openings can be missing, and source status explains this limitation.

Optional browser collection can later be enabled by running `python setup_scraping.py`, changing the setting to `"mode": "browser"`, and restarting the backend. The installer downloads Playwright from PyPI and Chromium from its official distribution into `.local-deps/` and `.browsers/`. It does not access resumes. Browser rendering reads the page DOM, with a fresh unsigned-in context and no stealth plugins, user cookies, proxy rotation, or CAPTCHA solving. A failed optional download does not prevent HTML-only collection.

Enter your Gemini key at the hidden prompt. It is held only in the process environment, never written to files, logs, or the browser. Open http://localhost:8081/ or use the existing static preview at http://localhost:8080/. To browse and search without Gemini, run `python server.py --port 8081` instead. The key is required only for explicitly requested AI actions.

The backend selects the Gemini model internally through `GEMINI_MODEL`, defaulting to `gemini-3.6-flash`. The main app has no model selector, connection test, benchmark, or manual resume-understanding panel. `.env.example` documents settings; .env files are not loaded automatically. LOW thinking is the default. Synthetic connection and speed-comparison endpoints remain available to developers through the API and are never called automatically by the browser.

After backend code changes, stop the old process with Ctrl+C and rerun `python start_agent.py`, re-entering the hidden key. Python does not reload the running module automatically. Frontend-only changes need a page reload, not a backend restart.

## Search and AI flow

1. Import a text PDF, DOCX or TXT resume, or paste its full text. Text extraction is local. Review reading order and confirm your actual total years. Select multiple Indian hiring cities and work style; Remote bypasses city selection.
2. One **Find jobs** button searches cached public listings. With a full resume, it ranks using the original text and preferences. Without a resume, it searches by preferences and shows **Not ranked yet**. It works without a Gemini key or AI consent. It never calls Gemini, and it never inserts proposed resume wording into matching inputs.
   A successful file import or **Use this resume** starts local ranking automatically using the current preferences. Review detected experience and rerun Find jobs after correcting preferences. Starting a search invalidates pending browse responses so they cannot replace scored results. Refresh jobs updates the company collection and retains resume-based ranking while a readable resume is loaded.
   The separate Browse jobs button was removed. Resume ranking requires at least 40 characters; nonempty shorter text prompts the user to provide the full resume or clear it. Genuine zero scores from a completed relevance search or explicit fit review remain visible. Resume text stays in memory and clears on reload; the upload status explains when no resume is loaded.
3. Local sentence embeddings compare responsibility-level meaning. Every job is split into overlapping chunks so requirements near the end are retained. Unchanged job embeddings are reused from SQLite; query embeddings remain in a bounded in-memory cache. Semantic ranking is combined with full-text relevance. During initial indexing, search explicitly uses full-text ranking until all eligible jobs have vectors; it never labels that fallback as semantic search. Relevance scores are not qualification assessments or hiring probabilities.
4. Location/work-style rules and clearly required experience limits are applied before ranking. Unknown work style or experience remains visible with uncertainty notes. Preferred experience and ambiguous years are not hard exclusions. Remote listings can still have country/timezone restrictions; inspect the original description.
5. The first **Review my fit** action automatically creates a concise structured profile internally: summary, role families, exact supporting facts/quotes, and uncertainties. The app asks for permission before the first AI action in the tab session. Consent covers sending the original resume, preferences, and selected job description to Google Gemini. Declining does not block local search or applications. A small **AI data permission** link in job details lets the user review or revoke that session permission. The API key remains on the backend. The backend caches up to eight profiles for at most 24 hours in memory, keyed by the original resume, model, thinking level, and date. Search location, work style, target terms, and confirmed years are deliberately excluded from the parse cache key. Failed parses are never cached. Changing preferences does not trigger another Gemini parse.
6. Open a job and choose **Review my fit** for a requirement-by-requirement assessment of that one role. Completed assessments can be reused in the page only when the original resume, preferences, model and complete job input match. Missing required qualifications produce a gap; unknown required evidence cannot produce a confident shortlist. Exact job/resume evidence is validated. The user's confirmed total years are shown in experience-gap explanations rather than an unverified model calculation. Initial search does not perform these per-job calls.
7. **Tailor my resume** returns a focused evidence map of up to eight decisive requirements, conservative wording edits, an optional evidence-backed summary, and optional ordering suggestions. Eligible wording lines are reviewed in batches of eight, with progress and an explicit **Review next** action; there is no six-correction total limit. Further batches retain earlier corrections and selections. Useful changes are proposed only where supported. Exact original lines, job quotes, protected sections, dates, numbers and explicit proficiency/ownership terms are checked; a second AI call checks wording and summary consistency. Approve changes individually or use **Select all compatible changes** / **Apply all compatible changes**. A summary replacement is an alternative to wording changes on its source lines; bulk approval prefers those wording changes to avoid applying conflicting alternatives. Bullet moves stay inside the original role; project moves preserve complete blocks; employer chronology is never reordered. Invalid or ambiguous evidence becomes Unclear. No unselected advice or missing qualification enters the draft. Local simple formatting remains available without Gemini.

### Resume extraction review

PDF text is reconstructed from text-item positions and baseline boundaries. A local review panel flags recognized joined skill names, ambiguous numeric dates, unusually fragmented text and wide gaps that may indicate columns. Select proposed corrections individually or select/apply all available corrections together. For uncertain text, enter a manual correction beside the original; dates and unfamiliar words are never guessed. Conflicting corrections for the same line are blocked. Applying corrections updates the original matching resume, clears old assessments/drafts, and reruns local ranking. Warnings may remain during job search but must be acknowledged for that exact text before AI tailoring. Drafts stay separate from the matching resume. These heuristics cannot recover every malformed or scanned document; users can edit and confirm the imported text.

### Company briefs

Each job card includes **Company brief**, with a compact two-column overview in job details. The on-demand `/api/company/brief` endpoint accepts only the ID of a currently cached job. It uses same-employer public listings for role/location snapshots, any supplied company description, technology mentions with exact source quotes, and explicitly stated role-specific hiring timelines. It does not infer a company-wide hiring average from listing age, urgency or application counts.

Recent news (30 days) and layoff-related headlines (90 days) are collected from public Google News RSS searches using only the employer name. Dates and employer-name matches are checked, and publisher names and article links are displayed. These are discovery headlines, not verified event summaries or a confirmed layoff status. Missing data remains unknown; failed feeds differ from empty searches. No applicant resume, API key or Gemini call is used. News is cached in memory for one hour (five minutes on feed failure), with at most 32 employers; request timeouts and feed sizes are bounded. The briefing layout limits headlines, technology mentions and role examples to keep it concise. It is an in-app summary, not a page-count-validated PDF export.

### LinkedIn referral contacts

Each job card has **Find a referral**, which opens role-specific referral tools in job details. Links search LinkedIn people by the selected employer, recruiting terms or job title. These are search shortcuts, not a verified employee directory or confirmed referral contacts; users should check the current employer on LinkedIn. Only public company/title search terms go to LinkedIn when a link is opened. No applicant resume or LinkedIn credentials are sent, and no messages or connection requests are sent automatically. An editable, in-memory request draft includes the original application link and can be copied locally. It makes no claims about qualifications or relationships.

## One-page Word export

The candidate name and contact block must precede section headings. Personal contact text is never flattened into comma-separated skills, recognized headings are never styled as the candidate name, and the browser blocks malformed legacy drafts from downloading. Rebuild such drafts from the original resume. For frontend releases run `python version_frontend.py <integer-version>` so the HTML entrypoint and all relative module imports refresh together; updating only the entrypoint can leave older cached formatter code active.

### Structured role-specific builder

Both the simple and AI-reviewed draft flows use a shared in-memory section model and live preview, informed by the public ATSResume builder patterns documented in `THIRD_PARTY_REFERENCES.md`. Arrange complete sections with up/down controls, reset to the current draft's original layout, or explicitly prioritize existing comma-separated skills whose full phrases occur in the selected job description. Names/contact details stay in the fixed header and employment entries retain their internal chronology. No job-required skill, example applicant data or replacement job title is inserted. Soft Skills and Additional Skills are supported as separate sections.

The readiness checklist covers recognized structure, contact presence, experience/projects, skills and a word-count guide; it is not an employer ATS score or a substitute for the Gemini evidence review. All controls update the preview, plain-text draft and downloads together without updating the original matching resume or making extra AI calls. Word export still checks the actual one-page fit. If the draft changes while export is in progress, the obsolete download is blocked.

Generated drafts normalize Skills, Technical Skills and Relevant Skills sections into comma-separated lists in the preview, plain-text draft and Word request. Recognizable concatenated skill names are separated only when the complete source chunk can be consumed without changing its letters; unknown names and original spellings stay intact. This formatting does not update the original matching resume or add job-description skills.

Both Word download actions use `resume_export.py` and `fit_resume.ps1` for verified one-page export. They preserve all visible draft text and use a compact A4 single-column layout: black standard-width Calibri, a larger name, smaller contact line, uppercase section headings, bold employment/education/project entry titles, hanging indents for existing bullets, consistent spacing, and 0.5â€“0.4 inch margins. Microsoft Word on the user's Windows backend checks pagination and tries 11, 10.5 and 10-point body layouts. Download requires exactly one page, matching Calibri metadata, and agreement between the approved draft, saved OOXML and Word body text (content, reading order, recognized contacts and sections). No columns, text boxes, images, tables or contact details in headers/footers are added. ATS parsing and selection cannot be guaranteed. Both draft flows show a formatted HTML preview with a collapsible plain-text view; the preview is illustrative and the final Word export remains the pagination authority. Layout recognition never rewrites resume facts or guesses how to split merged source words.

If the complete draft still exceeds one page at 10 points, export stops and asks for repeated wording to be shortened; it never silently deletes experience or uses unreadably small text. If Word cannot be launched from the backend session, the draft is preserved and the verification error is shown. A browser font estimate is not treated as proof of pagination. Restart the backend to load this endpoint. Formatting makes no Gemini calls.

## Public job cache

`job_sources.json` now configures official careers URLs for Figma, Stripe, Calendly, Rubrik, Databricks, Razorpay, Notion, Ramp and Atlan. `careers_scraper.py` starts at those URLs, follows published job links and employer-linked application pages, parses schema.org JobPosting JSON-LD or visible job descriptions, and uses optional Chromium DOM rendering for JavaScript pages. Some employers host their careers/application pages on Greenhouse, Lever or Ashby; those employer-linked HTML pages remain supported. No configured source calls their job-board APIs. Legacy feed parsers are retained only for backward compatibility and fixtures, and old API-cache records are excluded from current search results.

Inspired by the provider separation and source-health reporting in [career-ops](https://github.com/career-ops-hq/career-ops). This implementation was written separately; no repository code was copied. That project itself combines HTTP/API providers, browser verification and search fallbacks.

Automatic platform collection now uses the upstream [speedyapply/JobSpy](https://github.com/speedyapply/JobSpy) package (`python-jobspy==1.4.1`) through `platform_search.py` and `jobspy_worker.py`. Run `python setup_jobspy.py` once, then restart `python start_agent.py`. The package is isolated in `.jobspy-deps` so it does not replace the local semantic model's dependencies. There is no platform API key or login prompt. The optional Gemini key is only used for AI resume help. JSearch request code, key prompts and monthly budgets have been removed; legacy `platform:indexed` records are excluded from active search without deleting the old database.

All eight adapters are integrated: LinkedIn, Indeed, Glassdoor, ZipRecruiter, Bayt, Naukri, BDJobs and HelloWork. The current location selector covers India. JobSpy documents ZipRecruiter as US/Canada-only, BDJobs as Bangladesh-only and HelloWork as France-only, so those three report **unsupported location** instead of making foreign searches for Indian preferences. LinkedIn, Indeed, Glassdoor, Bayt and Naukri are queried for the selected Indian cities. Remote uses India without selected cities; remote eligibility still requires checking the original listing. Manual job import accepts direct links from all eight platforms.

Find jobs immediately ranks the cache locally and starts bounded JobSpy collection in the background. Only a broad role title and city/remote setting leave the backend; the original resume stays local. Each action starts at most five source/location searches, with two workers at a time, 20 requested listings per source and a 90-second timeout per worker process. Find jobs again continues remaining city searches. Successful queries are cached for six hours; failures have a 15-minute cooldown. There are no automatic retry loops, configured proxies, account cookies or CAPTCHA-solving integrations. Each subprocess receives only its search plan and has API key/token/proxy environment variables removed. Applicant text and query plans are not written to disk.

Accepted results require a full description and a recognised HTTPS application URL matching the returned source. Only job-description evidence determines experience requirements. Search snippets without descriptions are excluded, not scored as complete jobs. Public results expire from search after 24 hours. Blocked/failed collectors and zero usable results have distinct internal backend statuses. Collection messages, per-source diagnostics and cache counts are not rendered on the user page; job results update silently in the background. Collection is partial and destination sites must confirm availability; JobSpy does not guarantee exhaustive results or access. Original application links appear in job details and job cards. Existing company careers-page collection, Gemini tailoring and Word downloads remain available independently.

External LinkedIn/Naukri/Indeed search links and manual Add a job remain available without setup. Manual imports are labelled Added by you, preserve application identifiers and expire after 30 days.

The loopback backend refreshes careers pages on startup and every 15 minutes after the preceding refresh/index cycle, with at most three companies in parallel. Each company scan has a 35-page and two-minute budget, sequential page requests at least 1.5 seconds apart (or a longer declared crawl delay), bounded responses and timeouts. Robots rules, HTTPS/public-network addresses, redirect destinations and configured employer hosts are checked. Access denials, rate limits, login walls and challenges stop collection; browser rendering is not used to bypass an access denial. Additional employer application hosts must be explicitly included in `allowed_hosts`. The generic crawler can miss JavaScript widgets, custom URLs, nonstandard descriptions and hidden pagination; source notes disclose limited coverage. Site-specific adapters can be added later for those layouts.

Public jobs, source state, timestamps, content hashes and local job vectors are stored in `data/jobs.sqlite3`. No applicant documents or query vectors go into this database. Application links are read from published pages and must use HTTPS; they are not guessed. Unknown location and experience remain unknown, rather than fabricated from a page title.

Visible job-header locations (for example, the city between the job title and Apply on a Greenhouse-hosted careers page) are extracted even without a Location label. Startup repairs missing locations in cached careers descriptions using that same explicit header evidence, preserving the original check timestamp, experience facts and vectors. Empty browse queries skip model loading and vector retrieval. Zero-result responses include separate city/location, work-style and experience exclusion counts; the page explains those filters and clears obsolete search messages when browsing again.

Generic careers-page scans are always treated as partial: unvisited jobs are retained rather than declared closed. Scraped listings not seen again within 24 hours expire from search, even if later refreshes fail. Expired structured postings are skipped. Confirmed complete snapshots from a future site-specific adapter can close missing listings immediately. Failed/malformed refreshes retain unexpired cache and expose a safe source error. Closed jobs are purged after seven days. A manual refresh returns immediately and updates in the background; cached results remain searchable. First startup may require several minutes to fetch and index. Browse shows up to 200 listings; relevance search uses the full eligible active cache and returns up to 100 in the UI.

## Interfaces

- `GET /api/status`: provider/key configuration and supported capabilities; never credentials.
- `GET /api/jobs`: cached browse results, sources, freshness and semantic-index progress.
- `POST /api/jobs/refresh`: background public-feed refresh; no Gemini key/consent required.
- `POST /api/jobs/search`: original resume, preferences, optional result limit; local ranking only, no Gemini key/consent required.
- `POST /api/jobs/platform-search`: bounded JobSpy collection; requires the local package setup and sends only role/location terms. No platform key, login or Gemini calls.
- `POST /api/jobs/import`: user-pasted LinkedIn/Naukri job description and original job URL; no page fetching or Gemini call. Public job data only.
- `POST /api/resume/export`: draft text to verified one-page DOCX; local Microsoft Word required, no Gemini key or consent required. Optional developer `preview: true` includes an internal PDF for visual QA.
- `POST /api/agent/profile`: consented one-time resume understanding, independent of preferences.
- `POST /api/agent/shortlist`: optional detailed assessment (the UI sends one job).
- `POST /api/agent/tailor`: proposed edits with separate factual verification.
- `POST /api/connection-test` and `/api/models/benchmark`: explicit synthetic diagnostics, no applicant resume.

AI requests use structured JSON and bounded retries for transient service errors. Permanent key/permission/quota failures are not blindly repeated. Each AI workflow has a five-minute deadline and each model request at most 120 seconds. Provider availability can change after a successful diagnostic. The separate local search remains usable during Gemini errors. User-facing messages explain unavailable AI assistance without exposing provider configuration, benchmark output, or indexing diagnostics. Job-source freshness remains available because it helps users verify whether a listing is current.

## Privacy and validation

Applicant text and AI profiles/results are not stored in the job database or application logs. Search and AI data remain in memory. Word export temporarily writes the draft and generated document to a random local scratch folder, then deletes that folder after success or failure. Downloaded files are saved by the user. City/work-style settings and saved job IDs are local browser preferences. Only an explicit AI-permission choice is saved in sessionStorage for the current tab session; no document text or API key is stored there. Gemini receives applicant text only on the explicitly requested AI actions with consent; Google's API policies apply. The backend is loopback-only, rejects unrelated origins, limits inputs, validates evidence, treats documents as untrusted data, and does not log request/response bodies. It is a single-user local app, not an authenticated production service.

```powershell
python -m unittest test_agent test_tailoring_v2 test_job_store test_careers_scraper test_resume_export test_platform_search test_company_brief test_posting_history -v
node --preserve-symlinks --preserve-symlinks-main test-agent-ui.mjs
node --preserve-symlinks --preserve-symlinks-main test-platform-jobs.mjs
node --preserve-symlinks --preserve-symlinks-main test-referral-tools.mjs
node --preserve-symlinks --preserve-symlinks-main test-job-ranking.mjs
node --preserve-symlinks --preserve-symlinks-main test-one-page-export.mjs
node --preserve-symlinks --preserve-symlinks-main test-resume-preview.mjs
node --preserve-symlinks --preserve-symlinks-main test-extraction-review.mjs
node --preserve-symlinks --preserve-symlinks-main test-correction-selection.mjs
node --preserve-symlinks --preserve-symlinks-main test-tailoring-draft.mjs
node --preserve-symlinks --preserve-symlinks-main test-skill-format.mjs
node --preserve-symlinks --preserve-symlinks-main test-resume-builder.mjs
node --preserve-symlinks --preserve-symlinks-main test-resume-header.mjs
Get-Content -Raw dist/resume-tools.mjs | node --preserve-symlinks --preserve-symlinks-main test-resume.mjs
node --preserve-symlinks --preserve-symlinks-main test-export.mjs | python verify-export.py
```

Tests use synthetic fixtures and model stubs. A real local semantic check runs when the model is installed; no applicant data or live Gemini calls are used in automated tests. Live UI/provider checks require the restarted backend. Word validation needs python-docx (available in the bundled document runtime).

References: [Sentence Transformers model](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2), [JobPosting schema](https://schema.org/JobPosting), [Playwright Python](https://playwright.dev/python/docs/intro), [career-ops](https://github.com/career-ops-hq/career-ops), [LinkedIn crawling rules](https://www.linkedin.com/robots.txt).


# NextRole

**[Open NextRole](https://nextrole-job-match.hanashelbin.chatgpt.site/) · [Install Edge autofill](https://microsoftedge.microsoft.com/addons/detail/nextrole-application-auto/apolphfkmlnblkdlhfmleckphikgdfci) · [Report an issue](https://github.com/H-ana/NextRole/issues)**

A resume-based job discovery and application assistant. Find relevant roles, prepare a factual tailored resume, and fill application forms using reviewed information.

The public app runs primarily in your browser. An optional Python backend adds local collection, Gmail recruiter updates and Windows document checks. The public site does not connect visitors to the owner's Gmail account or local files.

## Features

| Feature | What it does |
| --- | --- |
| Job discovery | Searches public company/platform listings, deduplicates jobs, and links to the original application page. Coverage depends on each source. |
| Relevant roles | Uses role intent, experience, selected cities and work style before ranking. Related engineering roles can appear despite incomplete skill overlap. |
| Local matching | Keyword ranking with optional on-device MiniLM semantic similarity; a relevance score is not proof of eligibility. |
| Search controls | Multiple cities, optional nearby locations, platform filters, saved jobs and 24/48-hour posting filters. |
| Resume import | PDF, DOCX and text extraction, extraction review, and list-aware Word import. The retained original remains separate from the tailored draft. |
| Gemini tailoring | Whole-resume review, evidence-backed wording, summary and ordering suggestions, and at most two missing-evidence questions. |
| Clarification answers | Turns confirmed answers into complete accomplishment sentences, checks their meaning, and asks you to approve the wording before saving. |
| Downloads | Browser-generated one-page PDF, Word draft and text exports. PDF retains bullet markers and indentation with compact section spacing. |
| Application writing | Formal, friendly and concise cover-letter, recruiter-message and referral-request drafts. Nothing is sent automatically. |
| Applications | Local application timelines, referral details and interview preparation for relevant statuses. The optional local backend can add Gmail lifecycle updates. |
| Edge autofill | Extract and review profile facts, save a profile and resume to the extension, then scan and fill selected fields on careers sites. |
| Portable backup | Password-encrypted browser-data backup and restore, with a separate extension confirmation when restoring its documents. |

## Use the public app

1. Open [NextRole](https://nextrole-job-match.hanashelbin.chatgpt.site/) and upload your original resume.
2. Review extracted information and set your target roles, experience, cities and work style.
3. Click **Find jobs**, filter the results, and open the employer or platform application link.
4. Open a role to compare its requirements, prepare application writing or tailor your resume.
5. Install the Edge extension for application autofill. Review your profile, choose **Save to extension**, and confirm in the extension.

Resume text and the retained file stay in that visitor's browser storage on their own device until replaced, removed or browser data is cleared. Returning to another origin, browser profile or device does not automatically recover those copies.

### Optional Gemini tailoring

Use your own Google Gemini API key in the private field and explicitly consent to sending the relevant resume, job description and confirmed answers to Google. The browser sends requests directly to Google; the key remains in that tab's memory and is excluded from backups.

The browser client currently uses `gemini-3.1-flash-lite`, with limits of **3 reviews/day, 15 requests/day and 5 requests/review**, paced at up to 3 requests/minute. Model selection and limits are defined in [`gemini-client.mjs`](nextrole/dist/gemini-client.mjs). These browser controls do not override Google quotas or billing settings. Use a project with billing disabled if you require free-tier-only usage. No shared owner key or paid fallback is configured.

Tailoring preserves names, employers, dates, qualifications, numbers, technologies, proficiency and contribution level. Confirmed short answers first become proposed complete sentences. Local guards and a separate Gemini factual audit reject unsupported changes; you then select the wording to include. Teamwork and uncertainty must retain their meaning. Missing qualifications are not inserted. Failed AI requests do not erase already approved sentences. Further wording, summary and ordering changes remain opt-in.

### One-page PDF and Word

**Download one-page PDF** generates selectable text locally using bundled jsPDF and embedded, standard-width Carlito fonts. It preserves draft bullets, numbering and indentation, tightens spacing, and tries 11, 10.5, then 10 pt body text on A4. It does not use browser printing, so browser-generated dates, URLs and page headers/footers are absent. If the approved content cannot fit at 10 pt, export stops and requires user-approved shortening; content is not silently deleted.

Browser Word drafts use Calibri. Word pagination can differ from PDF/browser layout; desktop Word verification is an optional local backend capability. These are document checks, not certification by an employer's ATS, and no selection outcome is guaranteed. See [resume export details](nextrole/docs/RESUME_EXPORT.md).

## Run the optional local backend

Python 3.12+ is recommended. The frontend is plain HTML, CSS and JavaScript with no npm build step.

```powershell
git clone https://github.com/H-ana/NextRole.git
cd NextRole/nextrole
python setup_semantic.py   # Optional backend semantic ranking
python setup_jobspy.py     # Optional supported platform collection
python start_agent.py
```

Enter the optional Gemini key at the hidden backend prompt, or press Enter to skip. Open **http://localhost:8081/**. To run without the prompt:

```powershell
python server.py --port 8081
```

For a separate frontend preview, run `python -m http.server 8080 --directory dist` in another terminal while the backend remains on 8081. Use a consistent origin to retain browser data. Restart Python after backend changes.

Backend semantic/model and JobSpy installers use isolated local folders. Company pages can use HTML-only collection; `setup_scraping.py` adds optional Playwright/Chromium support. Collection can be incomplete or blocked and never bypasses login, CAPTCHA or access restrictions.

### Gmail and interview preparation

Gmail sync requires the local backend, a user-configured Desktop OAuth client and read-only authorization. It detects positive recruiter outreach, referrals, assessments, interviews and offers without requiring a job to be marked applied. Rejections are excluded from positive notifications; forwarded history remains history. Links open the corresponding Gmail message. Interview research is available from relevant application entries and cites public sources; reports are preparation material, not guaranteed future questions.

Saved Gmail credentials use Windows DPAPI. Notification/application metadata is stored in local SQLite and is not encrypted as a database. This is a single-user local feature, not a hosted multi-user Gmail service. See [Gmail setup](nextrole/GMAIL_SETUP.md).

## How matching and collection work

Public listing refresh is configured in [GitHub Actions](.github/workflows/public-jobs.yml), including a four-hour schedule and manual trigger. Jobs are collected independently of applicant resumes from configured company careers sources and supported JobSpy platforms. The browser merges the public feed with bundled listings and deduplicates results. Refreshes are subject to GitHub scheduling, source availability and collection limits; this is not a real-time or exhaustive feed.

The employer registry also includes a reviewed snapshot of 99 companies from Naukri's Fortune 500 directory filtered to Engineering - Software & QA (54 added employers). Targeted Naukri searches use employer names, verify returned company names, and reserve 32 of 64 rotating employer-query slots for this group; the normal resume, role and preference filters still apply. Category membership is a Naukri label, not independent certification of a current Fortune ranking or guaranteed suitable openings. See the [source snapshot](nextrole/docs/naukri-fortune-software-companies.json).

Configured employer catalogs constrain company coverage. Role-family matching avoids unrelated support/incident roles when engineering is the target. Location/work-style and experience checks precede ranking; jobs requiring less experience can still be suitable, while jobs with unstated experience are distinguished from confirmed matches. Optional browser semantic ranking combines **80% cosine similarity and 20% keyword relevance** over up to 250 filtered candidates. It uses quantized `Xenova/all-MiniLM-L6-v2` via Transformers.js/WASM. Model loading is cached where the browser supports it; failures fall back to keyword ranking. The embedding model compares meaning; PDF/DOCX parsers extract text.

The backend has its own collection/cache and ranking path. Source settings live in [`job_sources.json`](nextrole/job_sources.json), [`public_feed/`](nextrole/public_feed/) and the employer catalogs. Source posting dates drive freshness indicators; retrieval time is not presented as a new posting date. Posting checks suppress stronger scam/ghost indicators while missing salary or a short description alone does not remove a job.

## Data and privacy

| Data | Storage / transmission |
| --- | --- |
| Website resume text, reviewed profile and preferences | That visitor's browser localStorage. |
| Retained PDF/DOCX file | That website origin's IndexedDB on the visitor's device. |
| Extension profile and resume | Separate local Edge extension storage, retained until replaced or removed. |
| Active tailoring results and Gemini key | Tab memory; approved documents can be downloaded. |
| Public listings, indexes and posting history | Public feed and optional local backend cache; no applicant data belongs in the feed. |
| Local Gmail credentials | Windows DPAPI-protected files; never included in the public site or repository. |
| Gmail notification metadata | Local backend SQLite; email bodies are processed in memory and are not sent to Gemini. |
| Portable backup | User-downloaded encrypted file; no automatic cloud upload. |

Local search and PDF generation do not send resumes to Gemini. Explicit AI actions send the relevant inputs to Google under its terms. Initial model/library downloads and job feeds require internet access. Browser storage is not an encrypted vault, and website/extension copies do not automatically sync across devices. Saving/restoring extension documents requires its confirmation flow. Clearing a copy does not delete previously downloaded files or submitted applications.

The extension never submits applications, accepts declarations or bypasses CAPTCHA. Review filled fields: sites may autosave, and unfamiliar or sensitive questions may still need manual answers. See the [extension guide](nextrole/browser-extension/README.md) and [privacy notice](nextrole/dist/autofill-privacy.html).

## Development

Main directories:

- `nextrole/dist/`: browser application, document exports, matching and Gemini client.
- `nextrole/browser-extension/`: Edge extension and website handoff bridge.
- `nextrole/public_feed/`: public careers/platform collectors and deduplication.
- `nextrole/server.py`, `agent_service.py`, `job_store.py`: optional local API, AI and job cache.
- `nextrole/gmail_notifications.py`, `recruiter_mail.py`, `application_lifecycle.py`: local mailbox/lifecycle processing.
- `nextrole/docs/`: design notes, rollout history, role matching and export documentation. Dated rollout notes describe earlier releases; this README reflects the current behavior.

Run from `nextrole/`:

```powershell
python -m unittest discover -s . -p "test_*.py" -q
node --test test-clarification-sentences.mjs test-gemini-tailoring.mjs test-gemini-client.mjs test-resume-pdf.mjs test-free-rollout.mjs
```

The broader frontend suite consists of `test-*.mjs` files. The legacy `test-resume.mjs` reads its module through standard input; see its source before invoking it. Tests use synthetic fixtures and model stubs. Passing tests does not establish live Gemini output quality, every source's availability or Word pagination on every machine.

`GEMINI_API_KEY` and `GEMINI_MODEL` configure optional backend AI; browser AI uses its separate client constants. [`.env.example`](nextrole/.env.example) documents backend environment variables; `.env` files are not loaded automatically. Local credentials, dependency/model directories, generated QA captures and private applicant documents are excluded from Git. Do not commit real resumes, mailbox data or API/OAuth credentials.

## Credits

[JobSpy](https://github.com/speedyapply/JobSpy), [Sentence Transformers](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2), [Transformers.js](https://github.com/huggingface/transformers.js), [Mammoth](https://github.com/mwilliamson/mammoth.js), [jsPDF](https://github.com/parallax/jsPDF), [Carlito](https://github.com/googlefonts/carlito) and optional [Playwright](https://playwright.dev/python/). Bundled libraries/fonts retain their included licenses. See [third-party references](nextrole/THIRD_PARTY_REFERENCES.md). No project-wide license is declared.

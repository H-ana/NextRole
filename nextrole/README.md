# NextRole application

**Published site:** [NextRole](https://nextrole-job-match.hanashelbin.chatgpt.site/)


The main **[project README](../README.md)** contains the feature overview, installation instructions, architecture, privacy model and troubleshooting guide.

## Start from this folder

```powershell
python setup_semantic.py   # Optional local semantic ranking
python setup_jobspy.py     # Optional platform collection
python start_agent.py      # Optional Gemini key prompt; Enter to skip
```

Open **http://localhost:8081/**. No npm build is required.

## Development checks

```powershell
python -m unittest discover -s . -p "test_*.py" -q
```

For frontend checks and the legacy standard-input test invocation, see [Development](../README.md#development).

After changing Python code, restart the backend. After changing frontend modules, update the shared cache version with `python version_frontend.py <integer-version>` and reload the browser.

## Further documentation

- [Gmail connection and privacy](GMAIL_SETUP.md)
- [Third-party references](THIRD_PARTY_REFERENCES.md)
- [Environment variable template](.env.example)
- [Company source configuration](job_sources.json)
- [HTML/browser collection setting](scraping_settings.json)

Gmail credentials, private data, applicant documents and development screenshots must stay out of Git. See the root README for the complete storage model and platform limitations.


### Selected-employer recommendations

Job recommendations require an exact recognised employer name in `dist/mnc-employers.json`, before location/experience filtering and local semantic/full-text ranking. The same registry filters browser results and new-match alerts (including old stored alerts). Company legal suffixes and explicit aliases are normalised; descriptions, clients, words such as “global”, or a platform name do not establish employer identity. The registry now includes explicitly requested employer lists, including domestic companies and startups; it no longer claims every selected company is an MNC. Collection remains independent and may cache other employers, but those jobs are not recommended.

The registry includes the original curated MNC employers, the Thomson Reuters 2018 technology-company cohort and the additional user-requested lists described below, with explicit names, aliases and source references. Historical membership is a target-list inclusion rule. Ambiguous identifiers are withheld pending identity review. Add company aliases only after reviewing their identity. Registry changes need a backend restart and browser reload. This policy does not authenticate employer names supplied by third-party listings or guarantee that a cached vacancy remains open; existing source refresh and posting checks still apply. No Gemini request is used for this filter.


### Thomson Reuters company careers coverage

`dist/company-catalog.json` represents all 100 companies on the [2018 Thomson Reuters Top 100 Global Tech Leaders page](https://www.thomsonreuters.com/en/products-services/technology/top-100). This is a historical list, not a current ranking. `job_sources.json` adds 101 careers sources (NCR Voyix and NCR Atleos have separate sources). The original MNC employers remain eligible too. Google represents the initial Alphabet careers coverage; not every Alphabet subsidiary is collected.

The bounded HTML crawler visits configured company sites and employer-linked application hosts. Employer-hosted Workday and Oracle public careers interfaces have dedicated adapters in `company_collectors.py`; these are not third-party job-board aggregators. They send only static public job-search terms, never resumes, Gmail content or API keys. No additional package or paid API is required. Existing HTML-only mode is retained.

Workday and Oracle scans persist an offset in the public jobs database, continue on later refreshes, preserve full descriptions, application links and source dates, and exclude explicitly expired/closed jobs when that metadata is available. Partial scans retain previously collected jobs and do not declare unvisited jobs closed. Existing cache expiry and posting checks still apply. Indexing checks for new arrivals every 30 seconds while collection runs independently; search can use local full-text ranking until embeddings are ready.

The current Indian-city preferences are applied locally before ranking; a missing location is not assumed to match a selected city. No city list is hardcoded to this user in the runtime collector. The current app offers Indian cities, so these adapters initially collect India search results; NI uses its brand keyword on Emerson's portal, and local city filtering still applies. Broadcom/Thales/Emerson/FIS parent-portal jobs require evidence of the corresponding listed brand. They are not all relabelled as the acquired company. Facebook/Meta, ASM Pacific/ASMPT and the NCR split are represented explicitly.

All 100 companies being configured does **not** mean every company has a readable feed, a suitable vacancy in India, or exhaustive live coverage. Access denials, robots restrictions, JavaScript-only pages and incomplete scans are tracked as source failures/limitations, not invented zero-vacancy claims. Page-check status in the catalog describes the discovery-page check, not successful job ingestion. Some portals cover only particular regions. No access controls or CAPTCHAs are bypassed. Application links go to the employer's careers system; availability must still be checked there.

Validation: `python -m unittest test_company_collectors test_mnc_employers test_job_store test_careers_scraper test_platform_search` and `node test-mnc-employers.mjs`. Restart the backend after changing source definitions or the employer registry, and reload the browser after changing its registry asset.

### Additional requested employer lists

`dist/employer-catalogs.json` records the original names, deduplicated employer identities, source-list references, careers connections and unresolved limitations from:

- [Beginnersly Indian IT companies](https://www.beginnersly.com/article/indian-it-companies-list): 50 entries.
- [Built In Hyderabad software companies](https://builtin.com/articles/software-companies-in-hyderabad): 29 entries in the checked page.
- [GeeksforGeeks Bangalore companies](https://www.geeksforgeeks.org/blogs/top-software-companies-in-bangalore/): 25 entries.
- [Highest-paying software companies repository](https://github.com/miketromba/highest-paying-software-companies): 500 entries. Its December 2023 compensation snapshot is used only for company names, never current salary claims.
- Explicit additions: Novartis, HashedIn by Deloitte, Eli Lilly, Cornerstone OnDemand and Warner Bros. Discovery.

These resolve to 578 distinct targets, including overlap with existing sources. The configuration adds 275 careers sources and reuses 35 existing connections. There are 269 unresolved targets (including HashedIn, whose official careers URL is configured but blocked). A configured or verified careers page is **not** proof of readable jobs, complete coverage or current openings. Some names are historical, acquired or ambiguous; ambiguous identifiers have no invented employer mapping. The public catalog preserves these limitations rather than claiming every company is covered.

Employer-linked Greenhouse, Ashby and Lever pages can use their public published-job interfaces through `collect_published_board`. They remain company careers sources, preserve full descriptions and application links, and require no key. Feed access respects the same robots, public-address, redirect and employer-path restrictions as HTML crawling. Source update/creation timestamps are not presented as posting dates. JavaScript-only pages, access blocks and oversized feeds retain the previous cache; no bypass is attempted. Lilly and Cornerstone currently have HTML-only collection limitations; HashedIn blocks automated access.

Collection rotates through at most 18 due sources per batch with up to six HTML workers; at most three ordinary sources are reserved before expanded sources. A scheduler checks again after a 60-second pause; expanded catalogs have a six-hour cooldown and ordinary sources a 15-minute cooldown. Slow scans add to this interval. Manual refresh requests one bounded batch, rather than launching every employer at once. Workday/Oracle scans continue from saved offsets. Indexing runs independently every 30 seconds. An opening not seen for 24 hours is not recommended from the careers cache.

### Experience eligibility before ranking

`experience_policy.py` re-reads the original job description on every search. Cached numeric fields, role titles, keyword scores and Gemini do not establish required years. Mandatory numeric ranges and minimums are supported; optional experience, company age and preferred qualifications are ignored. Conflicting requirements and education-dependent alternatives remain unknown and are excluded from recommendations.

With 2 confirmed years, 2+ years and a 1–3- or 2–4-year range qualify for ranking; 3+ years and 4+ years do not. No experience shortfall is allowed. An explicit 2–4-year band excludes someone with 5 years. A minimum such as 2+ years has no inferred upper ceiling. The rule applies before semantic ranking, then again in browser results and new-match alerts, including stale stored stretch results. The current policy version is `strict-experience-v2`; the browser can safely recheck older source-backed bands using the same strict boundaries during rollout. Similarity still does not establish expertise in each technology or every mandatory qualification.

Checks: `python -m unittest test_experience_policy test_published_careers test_company_collectors test_mnc_employers test_job_store test_careers_scraper test_platform_search` and `node test-experience-policy.mjs`.

### Relevance cards and separate qualification review

Job cards again display local semantic/full-text relevance out of 100, sorted by relevance with existing feedback adjustments. AI qualification percentages do not replace card relevance. Unranked jobs show “Not ranked yet”. New-match alerts use the restored 70/100 relevance threshold. Open **Details & ATS resume → Review my fit** for the separate qualification assessment; the extra qualification button has been removed from cards. No backend restart is needed for this display restoration.

The fit-review prompt has no four-requirement cutoff. `qualification_scoring.py` builds a conservative exact-source qualification inventory and supplies it to the reviewer. The reviewer must assess all explicit qualifications, including additional criteria the inventory missed. Mandatory inventory statements omitted from the response become **Unclear**, preserving them in the denominator. Only complete source statements cover inventory entries. Quotes are validated against the original job/resume; invalid quotes lose support. A statement with several assessed parts counts once, requiring every assessed part to be supported. Preferred criteria remain separate. Experience is an independent check; discovery now excludes experience stretches. No identifiable mandatory qualifications means no percentage.

The server computes `floor(100 × fully supported mandatory checks / total mandatory checks)` instead of accepting the model's proposed score. Partial, missing and unclear checks score zero. The review exposes counts and exact evidence. It attempts comprehensive extraction but does not certify exhaustive eligibility or prove semantic entailment from quote validity alone. On failure, no qualification percentage is displayed; local discovery and applications remain available. Qualification coverage is confined to the detailed review; cards and new-match alerts use local relevance. Resume/preferences/job changes invalidate the existing review.

Flattened public descriptions are split at explicit skill/qualification headings while preserving exact source substrings. Work-style/location metadata is excluded from candidate qualification counts. A separate Gemini verification pass checks supported and missing claims, including domain-specific experience, against the complete original evidence. It may remove support or downgrade an unproven gap to unclear, never add support. A matching tool cannot stand in for an entire mandatory tool list, and an employer name cannot prove work style or proficiency. This second pass uses additional model tokens and latency. On verification failure no numeric score is accepted.

Validation: `python -m unittest test_qualification_scoring test_agent` and `node test-job-ranking.mjs`, `node test-opportunity-tools.mjs`, `node test-agent-ui.mjs`.

## Optional public Gemini tailoring

Job details now offers a whole-resume review using each user’s own Gemini free-tier key, held in tab memory. Missing-evidence questions, factual checks, batch edits, summary and ordering approvals are included. Local limits are three reviews and fifteen requests per browser/key per day, up to five requests per review, with cached results and no automatic retries. Use a Google project with billing disabled for no-charge use; browser limits are not a provider-wide spending cap. See [Gemini tailoring](docs/GEMINI_TAILORING.md) for privacy, validation and limitations. Job matching remains local and uses the original resume.

Recent updates: browser-owned Gemini tailoring with approved clarification sentences, semantic factual checks, list-aware DOCX import, direct one-page PDF export, and retained website/extension documents. See the [current overview](../README.md) and [export notes](docs/RESUME_EXPORT.md).

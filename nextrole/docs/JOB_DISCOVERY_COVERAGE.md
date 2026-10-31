# Job discovery coverage

The public app collects public vacancies separately from applicant documents. No resume, Gemini key, Gmail data, user cookies or account login is used by collection.

## Collection

- The public GitHub Actions workflow runs every four hours on standard Ubuntu runners, only while the repository is public. It scans every configured career source (up to 512), instead of rotating only 36. Individual employers still have bounded pages, deadlines and continuation cursors; a configured company is not a guarantee that its site is readable.
- Employer-linked Greenhouse, Lever and Ashby feeds are collected as employer career sources. Board names are discovered from configured employer pages, never guessed.
- JobSpy searches LinkedIn, Indeed, Naukri, Glassdoor and Bayt across the 17 supported Indian cities. All fifteen AI/software role variants run each cycle, plus AI and GenAI searches in each city, explicit remote searches and up to 64 employer-targeted queries per platform per refresh. All 251 approved employer rows participate. Saved per-company attempt history prioritizes unsearched employers and resumes coverage after the collection deadline. A complete pass needs at least four scheduled refreshes when all planned requests run; blocking, deadlines and scheduling can extend it. Each query requests up to 20 LinkedIn results or 40 results on other supported platforms; sites may return fewer. Platform results are published before the longer career scan completes.
- Platforms that block collection remain unavailable. No login, CAPTCHA bypass, proxy bypass or paid data service is used. Failed sources retain only still-fresh public cached jobs.
- Employer listings expire from this cache after seven days without successful verification; platform copies expire after 24 hours. Rechecking is not a guarantee that a vacancy remains open.
- Collection targets locations in India and explicitly worldwide remote listings. Overseas-only remote jobs are not assumed to accept applicants in India.

## Deduplication

Canonical application URLs, same-source job IDs, direct employer application links and employer-scoped requisition IDs identify duplicates. The career-site application link is preferred and other site links are retained. Matching title/location alone never merges separate requisitions. If two sites publish no shared ID, link or identical description, they cannot safely be asserted to be the same job.

## Matching

The original resume is used locally. Selected employers, stated minimum experience requirements where known, location/work style and role alignment remain required. Explicit mandatory recognised technologies and degree requirements are checked for review. Missing evidence does not suppress a role-aligned partial-match suggestion. Preferred skills do not become mandatory. These checks do not prove proficiency, domain experience, work authorization, or every free-text qualification. Unknown requirements remain unknown, not confirmed qualifications.

Semantic ranking refines relevance only. It does not waive experience, location or role preferences. Qualification gaps remain gaps, even when a partially matching job is suggested. Candidates outside the semantic batch remain available to keyword ranking rather than being deleted. The result limits are 200 roles with a confirmed experience fit plus 100 roles in a separate Experience not specified group, subject to all other user filters. Contradictory experience constraints and explicit higher minimums remain excluded.

## No-cost operation

Only standard public-repository GitHub-hosted runners are used. There are no Actions artifact/cache uploads, paid providers, hosted applicant backend or shared model credentials. The collection workflow refuses to run for a private repository. Site blocking, fair-use limits, GitHub scheduling delays and source outages can reduce coverage. This is broad configured coverage, not a promise of every technology company or every vacancy.

## Employer scope and original metadata

The curated registry covers 251 leading technology and major enterprise employers, including banks, consulting, product and life-sciences companies. This is an explicit coverage scope, not a current ranking or proof of internal technology deployment. Exact employer names and reviewed aliases are required; a company merely mentioned in a description does not qualify. Relevant advertised AI/software roles supply the technology context. Naukri experience ranges and work modes supplied by its source listing are retained, even when the description omits them. Unrecognised experience text remains unknown.

Applicants meeting the stated minimum can also see lower-experience roles even if their years exceed the advertised upper range. Original ranges remain visible. Unknown, contradictory or higher minimum requirements stay excluded.

## Broader discovery and complete employer-targeted coverage

Each query may read one additional page when its first page fills, with source-result deduplication, two workers per site and a 40-minute site budget. A failed second page preserves first-page results. The hard-coded forty-company list has been replaced by the full approved registry. Each employer rotates through AI, GenAI, ML and software engineering queries over successive visits. Targeted-query results must identify that employer through the exact-name/alias registry; merely mentioning the company in a description does not qualify. Explicitly verified LinkedIn company IDs are supported when supplied in the registry; no IDs are guessed. General role/city searches are interleaved with targeted searches. More title aliases include Applied AI, AI application development, LLM application engineering and early-career software titles.

The unfamiliar-title fallback requires an explicit AI development responsibility plus engineering context; support, sales and unrelated occupations remain excluded. Hyderabad/Secunderabad are aliases. Nearby metropolitan areas are opt-in and stored with browser preferences. Unknown experience is displayed separately and never presented as confirmed eligibility or a strong match merely because it was included.

Career collection can dispatch configured or explicitly employer-linked Workday and SmartRecruiters portals without relying on JavaScript HTML. The SmartRecruiters external-postings adapter retains full descriptions, locations, publication dates and requisition IDs, with bounded pagination, saved continuation cursors and partial-result retention. No authenticated/internal postings are requested. Generic site blocking remains a coverage limit.

# Job discovery coverage

The public app collects public vacancies separately from applicant documents. No resume, Gemini key, Gmail data, user cookies or account login is used by collection.

## Collection

- The public GitHub Actions workflow runs every four hours on standard Ubuntu runners, only while the repository is public. It scans every configured career source (up to 512), instead of rotating only 36. Individual employers still have bounded pages, deadlines and continuation cursors; a configured company is not a guarantee that its site is readable.
- Employer-linked Greenhouse, Lever and Ashby feeds are collected as employer career sources. Board names are discovered from configured employer pages, never guessed.
- JobSpy searches LinkedIn, Indeed, Naukri, Glassdoor and Bayt across the 17 supported Indian cities. One of five related engineering role queries rotates every four hours, completing that query cycle in approximately 20 hours, subject to scheduler delays and site availability.
- Platforms that block collection remain unavailable. No login, CAPTCHA bypass, proxy bypass or paid data service is used. Failed sources retain only still-fresh public cached jobs.
- Employer listings expire from this cache after seven days without successful verification; platform copies expire after 24 hours. Rechecking is not a guarantee that a vacancy remains open.
- Collection targets locations in India and explicitly worldwide remote listings. Overseas-only remote jobs are not assumed to accept applicants in India.

## Deduplication

Canonical application URLs, same-source job IDs, direct employer application links and employer-scoped requisition IDs identify duplicates. The career-site application link is preferred and other site links are retained. Matching title/location alone never merges separate requisitions. If two sites publish no shared ID, link or identical description, they cannot safely be asserted to be the same job.

## Matching

The original resume is used locally. Selected employers, stated experience bands, location/work style and role alignment remain required. Explicit mandatory recognised technologies and unambiguous degree requirements are checked against resume evidence; clearly missing evidence excludes the role. Preferred skills do not become mandatory. These checks do not prove proficiency, domain experience, work authorization, or every free-text qualification. Unknown requirements remain unknown, not confirmed qualifications.

Semantic ranking refines relevance only. It does not waive experience, location or required-skill checks. Candidates outside the semantic batch remain available to keyword ranking rather than being deleted. The result limit is 200 distinct roles, subject to all user filters.

## No-cost operation

Only standard public-repository GitHub-hosted runners are used. There are no Actions artifact/cache uploads, paid providers, hosted applicant backend or shared model credentials. The collection workflow refuses to run for a private repository. Site blocking, fair-use limits, GitHub scheduling delays and source outages can reduce coverage. This is broad configured coverage, not a promise of every technology company or every vacancy.

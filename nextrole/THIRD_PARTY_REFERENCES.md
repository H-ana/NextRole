# Resume builder reference

NextRole's structured resume workbench is independently implemented using the public design patterns in [sauravhathi/atsresume](https://github.com/sauravhathi/atsresume), inspected on 24 October 2026. That repository identifies its license as MIT.

Reviewed references: `src/components/builder.jsx`, `src/components/utility/DefaultResumeData.jsx`, and the README. They describe structured resume state, experience/project achievements, grouped skills, a live preview and section reordering. The README's AI tailoring promotion links to a separate service; that service's private implementation is not part of the inspected source.

No upstream source code or example applicant data is copied into NextRole. Its implementation preserves the user's source sections and employment chronology, lets the user reorder complete sections and existing skills, and keeps its existing Gemini evidence checks, approval workflow, Calibri styling and verified one-page Word exporter. No ATS certification, employer scoring algorithm or third-party account integration is implied.

## Job collection

NextRole integrates [speedyapply/JobSpy](https://github.com/speedyapply/JobSpy), pinned to the upstream `python-jobspy==1.4.1` PyPI distribution. JobSpy is MIT licensed; its distribution retains the upstream license. The integration calls `scrape_jobs`, reads its DataFrame and error/warning attributes, and normalizes results into the existing public job cache. No upstream source is copied into NextRole. The optional installer downloads JobSpy and its dependencies into a separate local directory. Eight upstream adapters are recognized; regional limits and collector failures are disclosed.

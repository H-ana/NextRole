# Role-aligned recommendations

A local deterministic role gate runs before both keyword and semantic ranking. An explicit searched occupation takes precedence; a skill-only search does not. Otherwise the resume headline/profile is used before short role headings from experience. Responsibility bullets and skill lists do not establish a target occupation.

Agentic AI / AI / ML development profiles allow AI engineering, GenAI, ML, forward-deployed and software development occupations. Support engineering/specialist, incident management, service desk and unrelated business occupations are excluded even when their descriptions contain the same skills. Development jobs are not excluded merely because their descriptions mention support workflows.

Other recognized role families retain their own related occupations. If resume intent cannot be identified, no occupation filter is invented; when intent is known but a job title cannot be classified, that job is not recommended. This is role relevance, not qualification or eligibility verification.

The public search applies the gate before candidate selection and semantic scoring. The shared UI recommendation guard applies the same rule to local-backend results, including cached results, without requiring a Python restart. Original resume text is the source; tailored drafts never affect intent. Existing company policy, experience, city, work style and posting checks remain in force. No added model, paid API or resume upload is required.

Tests: test-role-alignment.mjs and test-role-search.mjs cover intent precedence, adjacent titles, unrelated jobs with identical skills, support-related development responsibilities, unknown intent and both ranking paths.

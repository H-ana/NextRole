import assert from 'node:assert/strict';
import {suggestedAutofillProfile as parse} from './dist/autofill-profile.mjs';
const text=`RESUME
Full name: Alex Example | alex@example.com
+91 98765 43210
Bengaluru, Karnataka, India 560001
https://alex.example.com
PROFESSIONAL BACKGROUND
Example Ltd – Data Analyst | Jun 2024 - Present
- Built reconciliation pipelines.
ACADEMIC BACKGROUND
Example University | B.Tech in Computer Science | 2020 - 2024
SKILLS
Python, SQL`;
const p=parse(text,2);
assert.equal(p.firstName,'Alex');assert.equal(p.lastName,'Example');
assert.equal(p.email,'alex@example.com');assert.equal(p.city,'Bengaluru');
assert.equal(p.state,'Karnataka');assert.equal(p.country,'India');assert.equal(p.postalCode,'560001');
assert.equal(p.website,'https://alex.example.com');assert.equal(p.currentCompany,'Example Ltd');
assert.equal(p.currentTitle,'Data Analyst');assert.equal(p.educationHistory[0].endYear,'2024');
assert.equal(p.employmentHistory[0].startMonth,'June');assert.equal(p.skills,'Python, SQL');
assert.equal(p.willingToRelocate,undefined);assert.equal(p.availableStartDate,undefined);
assert.equal(parse('Alex Example\nPROFILE\nData analyst with 3 years of experience.').experience,'3');
assert.equal(parse('Alex Example\nEXPERIENCE\nExample Ltd | Data Analyst | 2020 - 2024').city,undefined);
assert.equal(parse('Alex Example\nEDUCATION\nExample University | B.Tech | 2020 - 2024').educationHistory[0].startMonth,'');
console.log('Resume profile prefill: contact header, location, alternate headings, history, dates and unclaimed preferences passed.');

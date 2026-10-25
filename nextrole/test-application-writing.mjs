import assert from 'node:assert/strict';
import {applicationVariants,WRITING_TONES} from './dist/application-writing.mjs';
const job={title:'Backend Engineer',company:'Example',url:'https://example.com/jobs/1'};
const drafts=applicationVariants(job,'Alex Example');
assert.deepEqual(Object.keys(drafts),WRITING_TONES);
for(const variant of Object.values(drafts))for(const text of Object.values(variant)){
 assert.match(text,/Backend Engineer/);assert.match(text,/Example/);assert.match(text,/Alex Example/);
 assert.doesNotMatch(text,/Relevant experience from my resume|Resume example:|expert|already applied|20%/);
}
assert.match(drafts.formal.cover,/Dear Hiring Team/);
assert.match(drafts.friendly.recruiter,/Hi \[Recruiter name\]/);
assert.ok(drafts.concise.cover.length<drafts.formal.cover.length);
assert.equal(new Set(Object.values(drafts).map(d=>d.cover)).size,3);
assert.match(applicationVariants(job).formal.cover,/\[Your name\]/);
assert.equal(applicationVariants({...job,url:'javascript:bad()'}).formal.recruiter.includes('javascript:'),false);
console.log('Passed: three tones for both draft types; role/company/name only; no resume facts; unsafe links excluded.');

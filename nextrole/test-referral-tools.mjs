import assert from 'node:assert/strict';
import {referralSearches,referralDraft} from './dist/referral-tools.mjs';
const job={company:'Example & Co',title:'AI Engineer',url:'https://www.linkedin.com/jobs/view/123'};
const urls=referralSearches(job);
for(const url of Object.values(urls)){
 const parsed=new URL(url);assert.equal(parsed.origin,'https://www.linkedin.com');assert.equal(parsed.pathname,'/search/results/people/');
 assert(parsed.searchParams.get('keywords').includes('Example & Co'));
}
assert(new URL(urls.similar).searchParams.get('keywords').includes('AI Engineer'));
assert(new URL(urls.recruiters).searchParams.get('keywords').includes('recruiter'));
const draft=referralDraft(job);assert(draft.includes(job.title));assert(draft.includes(job.company));assert(draft.includes(job.url));
assert(!referralDraft({...job,url:'javascript:alert(1)'}).includes('javascript:'));
assert(!referralDraft({...job,url:'https://user:secret@example.com'}).includes('secret'));
assert.equal(new URL(referralSearches({...job,company:'A & B "?redirect=https://evil.example'}).people).origin,'https://www.linkedin.com');
console.log('Passed: referral searches stay on LinkedIn, use the selected company and role, and draft requests include safe job links without invented qualifications.');

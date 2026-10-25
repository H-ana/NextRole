import assert from 'node:assert/strict';
import {publishedJobContacts,mountJobContacts} from './dist/job-contacts.mjs';
const base={url:'https://example.com/jobs/1'};
let contacts=publishedJobContacts({...base,description:'Recruiter: Jane Doe\nSend your resume to jane@example.com\nRecruiter LinkedIn: https://www.linkedin.com/in/jane-doe/'});
assert(contacts.some(c=>c.name==='Jane Doe'));assert(contacts.some(c=>c.email==='jane@example.com'));assert(contacts.some(c=>c.profile==='https://www.linkedin.com/in/jane-doe/'));assert(contacts.every(c=>c.source===base.url));
assert.equal(publishedJobContacts({...base,description:'For disability accommodations, contact accommodations@example.com.\nRecruitment privacy inquiries: privacy@example.com\nProduct support: support@example.com'}).length,0);
assert.equal(publishedJobContacts({...base,description:'Jane Doe is on our engineering team. Reach out to random@example.com.'}).length,0);
assert.equal(publishedJobContacts({...base,description:'Apply at hiring@example.com\nApply at hiring@example.com'}).length,1);
assert.equal(publishedJobContacts({...base,description:'Recruiter LinkedIn: https://linkedin.com.evil.test/in/person'}).length,0);
assert.equal(publishedJobContacts({...base,description:'No contact provided.'}).length,0);
console.log('Published recruiter contacts, source provenance, deduplication, support exclusions and profile URL checks passed.');

const emptyRoot={hidden:false,children:['old'],replaceChildren(){this.children=[];}};assert.equal(mountJobContacts(emptyRoot,{description:'No recruiter provided.'}),false);assert.equal(emptyRoot.hidden,true);assert.deepEqual(emptyRoot.children,[]);
const contactRoot={hidden:true};assert.equal(mountJobContacts(contactRoot,{...base,description:'Recruiter: Jane Doe'}),true);assert.equal(contactRoot.hidden,false);assert.match(contactRoot.innerHTML,/Jane Doe/);assert.doesNotMatch(contactRoot.innerHTML,/No recruiter contact|Find company recruiters/);

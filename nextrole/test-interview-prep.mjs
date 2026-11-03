import assert from 'node:assert/strict';
import {gmailInterviewUrl,questionGroups,canPrepareApplication,invitationForApplication} from './dist/interview-prep.mjs';
assert.equal(gmailInterviewUrl('person+test@example.com',{message_id:'abc123'}),'https://mail.google.com/mail/?authuser=person%2Btest%40example.com#all/abc123');
const groups=questionGroups({kind:'Candidate-reported experience',patterns:['Two rounds'],questions:['Explain hash maps?','Why this company?']});
assert.deepEqual(groups[1],['Reported DSA questions',['Explain hash maps?']]);
assert.deepEqual(groups[2][1],['Why this company?']);
assert.equal(questionGroups({kind:'Preparation article',questions:['Explain binary search?']})[1][0],'Published DSA practice questions');
assert.deepEqual(questionGroups({})[1][1],[]);
console.log('Source grouping separates reported DSA, other questions and preparation articles; Gmail deep links are account-specific.');
const app={status:'Interview',origin:'gmail',events:[{message_id:'one',category:'Interview invitation'},{message_id:'two',category:'Assessment / next step'}]};
assert(canPrepareApplication(app));assert(canPrepareApplication({...app,status:'Assessment / next step'}));
for(const status of ['Applied','Referred','Offer','Rejected','Recruiter reached out'])assert(!canPrepareApplication({...app,status}));
const invitations=[{id:1,message_id:'one',category:'Interview invitation',received_at:1},{id:2,message_id:'two',category:'Assessment / next step',received_at:2},{id:3,message_id:'unrelated',category:'Interview invitation',received_at:3}];
assert.equal(invitationForApplication(app,invitations).id,2);
assert.equal(invitationForApplication({...app,events:[]},invitations),null,'Never fall back to another job invitation');
assert.equal(invitationForApplication({...app,status:'Offer'},invitations),null);
console.log('Preparation is application-scoped, only for current interview/assessment statuses, and uses matching email IDs.');

assert.equal(questionGroups({patterns:["DSA Tutorial Course Explore"],questions:["DSA Tutorial"]}).flatMap(group=>group[1]).length,0);

assert.equal(questionGroups({patterns:["DSA & System Design CourseExplore"]}).flatMap(group=>group[1]).length,0);

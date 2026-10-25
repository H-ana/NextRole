import assert from 'node:assert/strict';
import {gmailInterviewUrl,questionGroups} from './dist/interview-prep.mjs';
assert.equal(gmailInterviewUrl('person+test@example.com',{message_id:'abc123'}),'https://mail.google.com/mail/?authuser=person%2Btest%40example.com#all/abc123');
const groups=questionGroups({kind:'Candidate-reported experience',patterns:['Two rounds'],questions:['Explain hash maps?','Why this company?']});
assert.deepEqual(groups[1],['Reported DSA questions',['Explain hash maps?']]);
assert.deepEqual(groups[2][1],['Why this company?']);
assert.equal(questionGroups({kind:'Preparation article',questions:['Explain binary search?']})[1][0],'Published DSA practice questions');
assert.deepEqual(questionGroups({})[1][1],[]);
console.log('Source grouping separates reported DSA, other questions and preparation articles; Gmail deep links are account-specific.');

assert.equal(questionGroups({patterns:["DSA Tutorial Course Explore"],questions:["DSA Tutorial"]}).flatMap(group=>group[1]).length,0);

assert.equal(questionGroups({patterns:["DSA & System Design CourseExplore"]}).flatMap(group=>group[1]).length,0);

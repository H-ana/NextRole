import assert from 'node:assert/strict';
import {interviewAnchors,approveInterviewFacts,clarificationQuestions,draftChanges} from './dist/resume-interview.mjs';
const source='Test Person\ntest@example.com\nEXPERIENCE\nAnalyst | Example | Jan 2024 – Present\n- Reconciled payroll records using SQL and investigated discrepancies.\nPROJECTS\n- Built a Python service for document analysis with a PostgreSQL database.';
const anchors=interviewAnchors(source);assert.equal(anchors.length,2);assert.equal(anchors[0].index,4);
const fact={index:4,original:anchors[0].text,answer:'Reviewed 500 records per weekly cycle.',kind:'outcome',approved:true};
assert.equal(approveInterviewFacts(source,[{...fact,approved:false}]).source,source);
const result=approveInterviewFacts(source,[fact]);assert.match(result.source,/500 records/);assert.equal(result.source.split('\n')[3],source.split('\n')[3]);assert.equal(source.includes('500'),false);
assert.throws(()=>approveInterviewFacts(source,[{...fact,index:3}]),/changed/);assert.throws(()=>approveInterviewFacts(source,[{...fact,original:'stale'}]),/changed/);
assert.throws(()=>approveInterviewFacts(source,[{...fact,answer:'javascript:bad',kind:'link'}]),/HTTPS/);
assert.throws(()=>approveInterviewFacts(source,[{...fact,answer:'Line\nHeading'}]),/sentence/);
assert.equal(clarificationQuestions({title:'Engineer',skills:['Python']},source).questions.length,2);
const changes=draftChanges(source,result.source,result.source,{suggestions:[],ordering_suggestions:[]},{wordings:[]},result.facts);assert.equal(changes[0].kind,'Confirmed evidence');assert.match(changes[0].after,/500/);
console.log('Interview fact approval, role boundaries, source preservation, project links and change review passed.');

assert(!clarificationQuestions({title:'Engineer',agent:{requirements:[{status:'missing',requirement:'SQL reconciliation'}]}},source).questions.some(q=>q.kind==='gap'),'Do not ask for SQL reconciliation already evidenced in the resume');

const complete=source.replace('investigated discrepancies.','investigated discrepancies, ensuring data consistency.').replace('a PostgreSQL database.','a PostgreSQL database, serving 50 users.')+'\nhttps://github.com/example/project';
assert.equal(clarificationQuestions({title:'Python Engineer',skills:['Python','SQL']},complete).questions.length,0,'Skip the interview when contribution, outcome and proof are already available');
const questions=clarificationQuestions({title:'Python Engineer',skills:['Python']},source).questions;
assert(questions.every(q=>q.anchor&&Number.isInteger(q.anchor.index)));assert(questions.every(q=>q.kind!=='contribution'));
const partial=clarificationQuestions({title:'Python Engineer',agent:{requirements:[{status:'missing',requirement:'Python deployment'}]}},source);
assert(partial.questions.some(q=>q.kind==='gap'&&q.label.includes('deployment')));

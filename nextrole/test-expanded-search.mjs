import assert from 'node:assert/strict';
import {deduplicateJobs} from './dist/opportunity-tools.mjs';
import {qualificationFit} from './dist/qualification-fit.mjs';
const make=(id,company='Microsoft',extra={})=>({id,company,title:'AI Engineer',location:'Bengaluru',description:'Build reliable production Python systems. '.repeat(4),url:'https://careers.microsoft.com/jobs/'+id,...extra});
assert.equal(deduplicateJobs([make('a'),make('a')]).length,1);
assert.equal(deduplicateJobs([make('a'),make('b')]).length,2,'Distinct requisitions remain distinct');
assert.equal(deduplicateJobs([make('a','Microsoft',{job_requisition_id:'R42'}),make('b','Amazon',{job_requisition_id:'R42',url:'https://amazon.jobs/jobs/b'})]).length,2,'Requisition IDs are employer scoped');
const merged=deduplicateJobs([make('li','Microsoft',{job_requisition_id:'R42',url:'https://www.linkedin.com/jobs/view/1234',listed_on:['LinkedIn']}),make('a','Microsoft',{job_requisition_id:'R42'}),make('in','Microsoft',{url:'https://www.indeed.com/viewjob?jk=abc',application_links:[{url:'https://careers.microsoft.com/jobs/a'}],listed_on:['Indeed']})]);
assert.equal(merged.length,1);assert.equal(merged[0].url,'https://careers.microsoft.com/jobs/a');assert.equal(merged[0].application_links.length,3);
const resume='Bachelor of Technology in Computer Science. Built Python and SQL services.';
assert(qualificationFit({description:'Required\nPython or Java\nPreferred\nKubernetes'},resume).eligible);
assert(!qualificationFit({description:'Minimum qualifications\nPython and Java'},resume).eligible);
assert(!qualificationFit({description:'Required\nMaster’s degree in Computer Science'},resume).eligible);
assert(qualificationFit({description:'Preferred\nJava and Kubernetes'},resume).eligible);
assert.equal(qualificationFit({description:'Develop great software.'},resume).status,'requirements-unclear');
console.log('Cross-source IDs, bridged URLs, distinct requisitions, employer scoping and mandatory-vs-preferred qualification evidence passed.');

assert(!qualificationFit({title:'Software Engineer (Go and Java)',description:'Develop backend services.'},resume).eligible);

const choices=qualificationFit({description:'Required\nStrong proficiency in Python or TypeScript/Node.js.\nComfortable using Git in a team.\nExcellent communication.\nUnderstanding of Agile software development.'},resume);assert(choices.eligible);assert.equal(choices.status,'qualification-review-needed');assert(choices.review.some(x=>x.unconfirmed.includes('Git')));assert(qualificationFit({description:'Required\nAt least one of Java, Kotlin, or Python, ReactJS.'},resume).eligible);assert(qualificationFit({description:'Required\nAWS and Kubernetes an added advantage.'},resume).eligible);assert(!qualificationFit({description:'Required\nPython and Java'},resume).eligible);assert(!qualificationFit({description:'Required\nPython and SQL or Java'},'PROFILE\nPython developer').eligible);
console.log('Language alternatives, optional advantages and unconfirmed foundational skills no longer cause false exclusions; unambiguous core requirements still apply.');

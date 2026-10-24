import assert from 'node:assert/strict';
import {pdfPageText,extractionIssues,applyExtractionCorrections} from './dist/extraction-review.mjs';
const item=(str,x,y,width)=>({str,transform:[1,0,0,1,x,y],width,height:10});
assert.equal(pdfPageText([item('SQL',45,80,18),item('Alex',0,100,20),item('Python',0,80,30)]),'Alex\nPython SQL');
assert.equal(pdfPageText([item('Fast',0,100,20),item('API',20,100,15)]),'FastAPI');
const text='Alex Example\nSkills\nPythonAnthropic Claude\nMicrosoft ExcelPrompt EngineeringMachine Learning\nEmployment: 03/04/2024\nProfessional summary\nAI';
const issues=extractionIssues(text);assert.equal(issues.filter(i=>i.replacement).length,2);
assert(issues.some(i=>i.reason.includes('Ambiguous numeric date')));
assert.equal(applyExtractionCorrections(text,issues,[]),text);
const corrected=applyExtractionCorrections(text,issues,[0]);assert(corrected.includes('Python, Anthropic Claude'));assert(corrected.includes('Microsoft ExcelPrompt EngineeringMachine Learning'));
assert.throws(()=>applyExtractionCorrections('changed',issues,[0]),/changed/);
assert.equal(extractionIssues('Profile\nFastAPI\nPython, SQL\nAI').length,0);
assert.equal(extractionIssues('PostgreSQL, MySQL, NoSQL, OpenAPI, ReactJS').length,0);
assert(extractionIssues('UnrecognizedSQLThing').some(i=>i.replacement===null&&i.reason.includes('joined')));
console.log('Passed: geometry-aware extraction, joined-word/date warnings, explicit correction selection and stale-source protection.');

assert(extractionIssues('PostgresSQLData analysisSQL').some(i=>i.replacement==='PostgresSQL, Data analysis, SQL'));

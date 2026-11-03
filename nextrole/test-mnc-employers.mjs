import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {employerIndex,isMncEmployer,mncListings} from './dist/mnc-employers.mjs';
const registry=JSON.parse(readFileSync(new URL('./dist/mnc-employers.json',import.meta.url),'utf8'));
const index=employerIndex(registry);
for(const row of registry.companies){
 assert.match(row.evidence_url,/^https:\/\//);
 for(const name of [row.name,...row.aliases])assert.ok(isMncEmployer({company:name+' Private Limited'},index),name);
}
for(const name of ['','MNC','Amazonia','Hiring for Amazon','Microsoft Staffing','Local firm'])assert.equal(isMncEmployer({company:name,description:'Google client'},index),false);
assert.deepEqual(mncListings([{company:'TCS'},{company:'Unknown'},{company:'Microsoft'}],index).map(j=>j.company),['TCS','Microsoft']);
assert.equal(mncListings([{company:'Microsoft'}],employerIndex(null)).length,0,'Missing registry fails closed');
const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8');
assert.ok(app.includes('deduplicateJobs(recommendedListings(items))'));
assert.ok(app.includes('filterJobs:recommendedListings'));
assert.ok(app.includes('allowJob:job=>isMncEmployer(job,mncIndex)'));
console.log('MNC employer policy checks passed');

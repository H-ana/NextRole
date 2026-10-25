import assert from 'node:assert/strict';
import {jobCardDetails} from './dist/job-card-details.mjs';
assert.equal(jobCardDetails({style:'unknown'}).workStyle,'◷ Work style unavailable');
assert.equal(jobCardDetails({style:'Hybrid',years:3,experience_quote:'3+ years of customer support experience'}).experienceDetail,'3+ years of customer support experience');
assert.equal(jobCardDetails({years:3}).experience,'Experience: 3+ years');
assert.equal(jobCardDetails({years:null}).experience,'Experience details unavailable');
assert.equal(jobCardDetails({location:'Bengaluru',description:'Collaborate with remote teams.'}).workStyle,'◷ Work style unavailable');
assert.equal(jobCardDetails({description:'This role is fully remote.'}).workStyle,'◷ Remote');
assert.equal(jobCardDetails({description:'Work arrangement: hybrid'}).workStyle,'◷ Hybrid');
assert.equal(jobCardDetails({location:'On-site - Bengaluru'}).workStyle,'◷ On-site');
console.log('Job card details preserve source evidence and label missing information clearly.');

assert.equal(jobCardDetails({years:0,experience_quote:'0-2 years of experience in reporting'}).experience,'Experience: 0–2 years');

const figma=jobCardDetails({style:'unknown',description:"This role will be held from our Bangalore office on a hybrid basis.\nWe’d love to hear from you if you have:\n2+ years of experience in a technical SaaS Support environment, ideally supporting Enterprise customers"});
assert.equal(figma.workStyle,'◷ Hybrid');assert.match(figma.experience,/Experience: 2\+ years/);assert.match(figma.experienceDetail,/technical SaaS Support/);
assert.equal(jobCardDetails({description:'This role is not remote.'}).workStyle,'◷ Work style unavailable');
assert.equal(jobCardDetails({description:'This is a full time role that can be held from one of our US hubs or remotely in the United States.'}).workStyle,'◷ Office or remote');

assert.equal(jobCardDetails({description:'This role will be held from our Bengaluru office.'}).workStyle,'◷ Office-based');
assert.equal(jobCardDetails({description:'2+ years in a customer support role, ideally at a SaaS company'}).experience,'Experience: 2+ years');

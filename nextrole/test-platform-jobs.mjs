import assert from 'node:assert/strict';
import {platformSearches,platformName,applicationLabel,matchesJobSite} from './dist/platform-jobs.mjs';
let links=platformSearches({query:'Data Analyst',cities:['Bengaluru'],workstyle:'Hybrid'});
assert.equal(new URL(links.linkedin).searchParams.get('keywords'),'Data Analyst');
assert.equal(new URL(links.linkedin).searchParams.get('location'),'Bengaluru, India');
assert.equal(links.naukri,'https://www.naukri.com/data-analyst-jobs-in-bengaluru');
links=platformSearches({query:'Python',cities:['Mumbai'],workstyle:'Remote'});
assert.equal(new URL(links.linkedin).searchParams.get('f_WT'),'2');
assert.equal(new URL(links.linkedin).searchParams.get('location'),'India');
assert(!links.naukri.includes('mumbai'));
links=platformSearches({query:'<script>alert(1)</script>',cities:['Mumbai','Pune']});
assert.equal(new URL(links.linkedin).hostname,'www.linkedin.com');
assert.equal(new URL(links.naukri).hostname,'www.naukri.com');
assert.equal(new URL(links.indeed).hostname,'in.indeed.com');
assert.equal(platformName('https://in.indeed.com/viewjob?jk=abc'),'Indeed');
for(const [url,name] of [
 ['https://www.glassdoor.co.in/job-listing/data-analyst-JV.htm?jl=123','Glassdoor'],
 ['https://www.ziprecruiter.com/c/Example/Job/Data-Analyst?jid=123','ZipRecruiter'],
 ['https://www.bayt.com/en/india/jobs/data-analyst-12345/','Bayt'],
 ['https://jobs.bdjobs.com/jobdetails.asp?id=12345','BDJobs'],
 ['https://www.hellowork.com/fr-fr/emplois/12345.html','HelloWork']
]){
 assert.equal(platformName(url),name);
 assert.equal(applicationLabel({url}),`Apply on ${name} →`);
}
assert.equal(platformName('https://www.bayt.com.evil.test/en/india/jobs/foo-12345/'),null);
assert.equal(platformName('https://linkedin.com.evil.example/jobs/view/123'),null);
assert.equal(applicationLabel({url:'https://www.linkedin.com/jobs/view/123'}),'Apply on LinkedIn →');
const shared={source:'platform:jobspy',url:'https://www.linkedin.com/jobs/view/123',application_links:[{platform:'Naukri',url:'https://www.naukri.com/job-listings-analyst-123'}]};
assert(matchesJobSite(shared,'all'));assert(matchesJobSite(shared,'LinkedIn'));assert(matchesJobSite(shared,'Naukri'));
assert(!matchesJobSite(shared,'Indeed'));assert(!matchesJobSite(shared,'careers'));
assert(matchesJobSite({source:'careers:example',url:'https://careers.example.com/jobs/123'},'careers'));
assert(!matchesJobSite({source:'platform:jobspy',listed_on:['Indeed'],url:'https://example.com'},'Indeed'));
console.log('Passed: platform links encode search terms, use preferences, skip remote cities, and retain fixed destination hosts.');

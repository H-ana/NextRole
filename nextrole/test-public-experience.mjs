import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const inbox=await fs.readFile('dist/recruiter-inbox.mjs','utf8');
let appended=[],polls=0;
function node(){return {hidden:false,prepend(){},append(){},setAttribute(){},querySelector(){return {onclick:null};},showModal(){this.open=true;},close(){this.open=false;}};}
const context=vm.createContext({location:{hostname:'nextrole-job-match.blueowl129.chatgpt.site'},document:{createElement:node,body:{append(n){appended.push(n);}},querySelector:node},findBackend(){polls++;throw Error('Must not access a shared mailbox');},setTimeout(){polls++;},URL});
vm.runInContext(inbox.replace(/^\uFEFF?import[^\n]*\n/,'').replace('export function setupRecruiterInbox','function setupRecruiterInbox')+'\nsetupRecruiterInbox();',context);
assert.equal(polls,0,'Public inbox must not poll local/shared Gmail endpoints');
assert.match(appended[0].innerHTML,/Gmail sync stays in your private workspace/);
assert.match(appended[0].innerHTML,/http:\/\/localhost:8081\/\?view=notifications/);
assert.doesNotMatch(appended[0].innerHTML,/OAuth|JSON|Cloud project|test user/);
const {friendlyAiError}=await import('./dist/agent-ui.mjs');
assert.doesNotMatch(friendlyAiError(Error('Restart the backend with python start_agent.py')),/backend|python|key/);
const profile=await fs.readFile('dist/autofill-profile.mjs','utf8');assert(!profile.includes('data-developer'));assert(!profile.includes('before this update'));
const index=await fs.readFile('dist/index.html','utf8');assert(index.includes('public-help'));assert(index.includes('Autofill privacy'));assert(!index.includes('Resume stays local until'));
for(const name of ['agent-ui.mjs','one-page-export.mjs','platform-jobs.mjs','app.js','api-client.mjs'])assert.doesNotMatch(await fs.readFile('dist/'+name,'utf8'),/Restart the backend|Start the local backend/);
console.log('Public copy, help links, safe errors and hosted Gmail isolation passed.');

const experience=await fs.readFile('dist/public-experience.mjs','utf8');
assert.doesNotMatch(experience,/public-availability|Find company jobs\. Keep your resume|data-service-state/);
assert.match(experience,/loadPublicFeed\(\)\.catch/,'Feed still preloads without rendering the banner');

assert.doesNotMatch(experience,/Resume tools|setupFreeResumeTools/);
const backup=await fs.readFile('dist/portable-backup.mjs','utf8');assert.match(backup,/getElementById\('application-tools'\)\.append/);
const editor=await fs.readFile('dist/free-resume-tools.mjs','utf8');assert.doesNotMatch(editor,/launch\.textContent='Resume tools'/);assert.match(editor,/export function openJobResume/);

assert.match(index,/id="application-tools"/);assert.match(profile,/getElementById\('application-tools'\)\.append/);assert.doesNotMatch(profile,/parentElement\.after\(button\)/);

assert.doesNotMatch(profile,/Download profile backup|data-manage-help|Saved-file verification and removal|The website uses this site/);

assert.doesNotMatch(index,/Your resume, your control/);assert.match(index,/id="header-actions"/);

assert.doesNotMatch(index,/Built around you|Choose where and how you want to work|Upload your resume to prefill your profile/);
assert.doesNotMatch(await fs.readFile('dist/app.js','utf8'),/Resume restored from this browser/);

assert.doesNotMatch(experience,/add\.disabled=true/);assert.doesNotMatch(await fs.readFile('dist/local-applications.mjs','utf8'),/Gmail does not sync in this version/);assert.doesNotMatch(await fs.readFile('dist/app.js','utf8'),/Review my fit on a promising job in All matches/);

assert.doesNotMatch(await fs.readFile('dist/platform-jobs.mjs','utf8'),/id="add-platform-job"|platform-job-dialog/);

import assert from 'node:assert/strict';
import {postingFreshness,matchesPostingFreshness} from './dist/posting-freshness.mjs';
const now=Date.parse('2026-10-25T10:00:00Z'),hour=3600000;
assert.equal(postingFreshness({date_posted:now-hour},now).band,'24');
assert.equal(postingFreshness({date_posted:(now-24*hour)/1000},now).band,'24');
assert.equal(postingFreshness({date_posted:now-25*hour},now).band,'48');
assert.equal(postingFreshness({date_posted:new Date(now-48*hour).toISOString()},now).band,'48');
assert.equal(postingFreshness({date_posted:now-49*hour},now),null);
assert.equal(postingFreshness({date_posted:now+hour},now),null);
assert.equal(postingFreshness({date_posted:'2026-10-25'},now).label,'Posted today');
assert.equal(postingFreshness({date_posted:'2026-10-24'},now).label,'Posted yesterday');
assert.equal(postingFreshness({date_posted:'2026-10-23'},now),null);
assert.equal(postingFreshness({date_posted:'2026-02-30'},now),null);
for(const value of [null,undefined,'garbage',0,'2026-10-25T10:00:00'])assert.equal(postingFreshness({date_posted:value},now),null);
assert.equal(postingFreshness({last_checked:now/1000,first_observed:now/1000},now),null,'Collection timestamps must not become posting dates');
assert.equal(postingFreshness({date_posted:'2026-10-26'},Date.parse('2026-10-25T20:00:00Z')).label,'Posted today','Date-only labels use the user’s India timezone');
console.log('Posting-age boundaries, date-only precision, timezone, invalid/future dates and collection-time exclusion passed.');

assert.equal(postingFreshness({date_posted:Date.parse('2026-10-24T00:00:00Z')},now).label,'Posted yesterday','Serialized date-only timestamps must not claim an exact posting hour');

for(const date_posted of [undefined,'garbage',now-49*hour]){
 assert.equal(matchesPostingFreshness({date_posted},'all',now),true);
 assert.equal(matchesPostingFreshness({date_posted},'24',now),false);
 assert.equal(matchesPostingFreshness({date_posted},'48',now),false);
}
for(const date_posted of [now-hour,now-24*hour,'2026-10-25']){
 assert.equal(matchesPostingFreshness({date_posted},'24',now),true);
 assert.equal(matchesPostingFreshness({date_posted},'48',now),true);
}
for(const date_posted of [now-25*hour,now-48*hour,'2026-10-24']){
 assert.equal(matchesPostingFreshness({date_posted},'24',now),false);
 assert.equal(matchesPostingFreshness({date_posted},'48',now),true);
}
assert.equal(matchesPostingFreshness({date_posted:now+hour},'48',now),false);
assert.equal(matchesPostingFreshness({last_checked:now/1000},'48',now),false);
console.log('Any-time, 24-hour and 48-hour filtering passed, including unknown dates and date-only sources.');

const DAY=86400000;
const zone='Asia/Calcutta';
export function postingFreshness(job,now=Date.now()){
 let value=job.date_posted;
 // Job collectors often serialize a date-only value as midnight UTC. Keep
 // that precision conservative instead of advertising an exact posting hour.
 if(typeof value==='number'&&Number.isFinite(value)&&value>0){const date=new Date(value<1e12?value*1000:value);if(date.getUTCHours()===0&&date.getUTCMinutes()===0&&date.getUTCSeconds()===0&&date.getUTCMilliseconds()===0)value=date.toISOString().slice(0,10);}
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)){
  const date=Date.parse(value+'T00:00:00Z');
  if(!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==value)return null;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
  const today=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day)),days=(today-date)/DAY;
  if(days!==0&&days!==1)return null;
  return {band:days===0?'24':'48',label:days===0?'Posted today':'Posted yesterday',detail:'Source posting date: '+value+'. The source does not provide an exact posting time.'};
 }
 let posted=NaN;
 if(typeof value==='number'&&Number.isFinite(value)&&value>0)posted=value<1e12?value*1000:value;
 else if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value))posted=Date.parse(value);
 const age=now-posted;
 if(!Number.isFinite(age)||age<0||age>2*DAY)return null;
 return {band:age<=DAY?'24':'48',label:age<=DAY?'Posted in last 24 hours':'Posted 24–48 hours ago',detail:'Source posted: '+new Date(posted).toLocaleString('en-IN',{timeZone:zone})+' IST'};
}

export function matchesPostingFreshness(job, selection='all', now=Date.now()) {
 if(selection==='all')return true;
 const freshness=postingFreshness(job,now);
 return selection==='24'?freshness?.band==='24':selection==='48'?Boolean(freshness):false;
}

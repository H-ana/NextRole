// Display source-backed details without guessing requirements from a job title.
export function jobCardDetails(job){
 const description=String(job.description||''),location=String(job.location||'');
 const lines=description.split(/\n|(?<=[.!?])\s+(?=[A-Z])/).map(line=>line.trim()).filter(Boolean);
 const officeOrRemote=lines.some(line=>/\b(?:role|position)\b.*\b(?:held|based|work)\b.*\b(?:hubs?|offices?)\b.*\bor\s+remote(?:ly)?\b/i.test(line));
 let style=['Remote','Hybrid','On-site'].includes(job.style)?job.style:'';
 if(!style&&officeOrRemote)style='Office or remote';
 if(!style){
  if(/\bhybrid\b/i.test(location))style='Hybrid';
  else if(/\bremote\b/i.test(location))style='Remote';
  else if(/\bon[- ]site\b/i.test(location))style='On-site';
  else {
   const match=description.match(/\b(?:this (?:role|position|job) is|work (?:style|arrangement|model)\s*[:–-])\s*(?:a\s+|fully\s+)?(remote|hybrid|on[- ]site)\b/i)
    ||lines.filter(line=>/\b(?:this (?:role|position|job)|you (?:will|must)|you['’]ll|based|work(?:ing)? (?:from|at|in))\b/i.test(line)&&!/\b(?:not|no|isn['’]t|cannot)\b/i.test(line)).map(line=>line.match(/\b(hybrid|on[- ]site|remote(?:ly)?)\b/i)).find(Boolean);
   if(match)style=/^on/i.test(match[1])?'On-site':/^remote/i.test(match[1])?'Remote':/^hybrid/i.test(match[1])?'Hybrid':'';
  }
 }
 // Display quoted experience even when the strict eligibility filter has no
 // confirmed minimum. Preferred requirements retain their original wording.
 if(!style&&lines.some(line=>/\b(?:this (?:role|position)|full[- ]time role|work from)\b.*\b(?:based in|held from|work from|our)\b.*\boffice\b/i.test(line)&&!/\b(?:remote|hybrid|not|optional)\b/i.test(line)))style='Office-based';
 const experiencePattern=/\b\d{1,2}(?:\s*[-–—]\s*\d{1,2})?\+?\s*(?:years|yrs)(?:['’])?\s+(?:of\s+)?(?:[\w/-]+\s+){0,10}experience\b/i;
 const roleYears=/^\s*(?:[•●*-]\s*)?\d{1,2}(?:\s*[-–—]\s*\d{1,2})?\+?\s*(?:years|yrs)\s+(?:in|as|working|building|developing|managing)\b.*\b(?:role|support|engineer(?:ing)?|development|sales|marketing|design|analytics|research|management)\b/i;
 const quote=String(job.experience_quote||'').trim()||lines.find(line=>(experiencePattern.test(line)||roleYears.test(line))&&!/\b(?:company|founded|business|industry)\s+(?:has|with|over)\b/i.test(line))||'';
 const range=quote.match(/\b(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*(?:years|yrs)\b/i),years=quote.match(/\b(\d{1,2})(\+?)\s*(?:years|yrs)\b/i);
 const preferred=/\b(?:preferred|nice.to.have|bonus|desirable)\b/i.test(quote)&&!/\b(?:required|minimum|must have|at least)\b/i.test(quote);
 return {workStyle:'◷ '+(style||'Work style unavailable'),experience:range?`Experience: ${range[1]}–${range[2]} years${preferred?' (see listing)':''}`:years?`Experience: ${years[1]}${years[2]} years${preferred?' (see listing)':''}`:Number.isFinite(job.years)?`Experience: ${job.years}+ years`:'Experience details unavailable',experienceDetail:quote};
}

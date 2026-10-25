import {formatSkillSections} from './skill-format.mjs?v=91';
export function buildReviewedDraft(source,data,{wordings=[],summary=false,orderings=[]}={}){
 const lines=source.split('\n'),values=[...lines];let sequence=lines.map((_,i)=>i);
 if(summary&&wordings.some(index=>(data.summary_suggestion?.replace_indices||[]).includes(data.suggestions[index]?.line_index)))throw new Error('Choose either the replacement summary or wording edits to the existing summary.');
 for(const index of wordings){const edit=data.suggestions[index];if(!edit||lines[edit.line_index]!==edit.original)throw new Error('The original resume changed. Request fresh suggestions.');values[edit.line_index]=edit.replacement;}
 for(const index of orderings){
  const group=data.ordering_suggestions[index];if(!group)throw new Error('Invalid ordering suggestion.');
  const original=group.items.flat(),proposed=group.item_order.flatMap(i=>group.items[i]);
  if(original.length!==new Set(original).size||[...original].sort((a,b)=>a-b).join()!=[...proposed].sort((a,b)=>a-b).join()||original.some(i=>!Number.isInteger(i)||i<0||i>=lines.length))throw new Error('Invalid ordering suggestion.');
  const slots=sequence.map((id,i)=>original.includes(id)?i:-1).filter(i=>i>=0);
  // Preserve previously approved within-project bullet ordering when moving projects.
  const replacement=group.kind==='projects'?group.item_order.flatMap(i=>sequence.filter(id=>group.items[i].includes(id))):proposed;
  slots.forEach((slot,i)=>{sequence[slot]=replacement[i];});
 }
 let insertAt=-1,skip=new Set();
 if(summary&&data.summary_suggestion){
  const s=data.summary_suggestion;skip=new Set(s.replace_indices||[]);
  if(skip.size){insertAt=Math.min(...skip);values[insertAt]=s.text;skip.delete(insertAt);}
  else {insertAt=lines.findIndex(line=>/^(experience|work experience|professional experience|employment history|projects|education|skills)\s*:?$/i.test(line.trim()));if(insertAt<0)insertAt=lines.length;}
 }
 const result=sequence.filter(i=>!skip.has(i)).map(i=>values[i]);
 if(summary&&data.summary_suggestion&&!(data.summary_suggestion.replace_indices||[]).length){const pos=sequence.indexOf(insertAt);result.splice(pos<0?result.length:pos,0,'SUMMARY',data.summary_suggestion.text,'');}
 return formatSkillSections(result.join('\n'));
}

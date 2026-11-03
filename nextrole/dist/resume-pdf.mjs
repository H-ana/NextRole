import {assertResumeHeader,resumeHeading,personalContact} from './resume-header.mjs?v=113';
let library;
const fontCache=new Map();
async function browserLibrary(){
 if(globalThis.jspdf?.jsPDF)return globalThis.jspdf.jsPDF;
 if(!library)library=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('./vendor/jspdf.umd.min.js',import.meta.url).href;script.onload=()=>globalThis.jspdf?.jsPDF?resolve(globalThis.jspdf.jsPDF):reject(Error('The PDF library could not load.'));script.onerror=()=>{library=null;reject(Error('The PDF library could not load. Try again.'));};document.head.append(script);});
 return library;
}
async function fontData(name){
 if(!fontCache.has(name))fontCache.set(name,(async()=>{const response=await fetch(new URL('./fonts/'+name,import.meta.url));if(!response.ok)throw Error('The PDF font could not load. Try again.');const bytes=new Uint8Array(await response.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);})().catch(error=>{fontCache.delete(name);throw error;}));
 return fontCache.get(name);
}
export function pdfRows(text){
 assertResumeHeader(text);const rows=[];let first=true,inBody=false;
 for(const raw of text.replace(/\r\n?/g,'\n').split('\n')){
  const line=raw.trimEnd();if(!line.trim()){if(rows.length&&rows.at(-1).kind!=='space')rows.push({kind:'space'});continue;}
  const trimmed=line.trim(),heading=resumeHeading.test(trimmed);
  if(heading)inBody=true;
  const match=line.match(/^(\s*)([-*•●▪◦‣–—]|\d{1,2}[.)])\s+(.+)$/);
  if(!heading&&!match&&rows.at(-1)?.kind==='bullet'&&(/^[a-z(]/.test(trimmed)||/^\s{2,}\S/.test(line))){rows.at(-1).text+=' '+trimmed;continue;}
  const kind=first?'name':heading?'heading':match?'bullet':!inBody&&personalContact.test(trimmed)?'contact':'body';
  rows.push({kind,text:match?match[3]:trimmed,marker:match?.[2]||'',indent:match?Math.min(3,Math.floor(match[1].replace(/\t/g,'  ').length/2)):0});first=false;
 }
 while(rows.at(-1)?.kind==='space')rows.pop();return rows;
}
export function registerPdfFonts(doc,{regular,bold}){
 doc.addFileToVFS('Carlito-Regular.ttf',regular);doc.addFont('Carlito-Regular.ttf','Carlito','normal');
 doc.addFileToVFS('Carlito-Bold.ttf',bold);doc.addFont('Carlito-Bold.ttf','Carlito','bold');
}
function supported(doc,text){const map=doc.getFont().metadata?.cmap?.unicode?.codeMap;if(!map)return false;return [...text].every(char=>/\s/.test(char)||map[char.codePointAt(0)]);}
export function planResumePdf(doc,text,size){
 const width=doc.internal.pageSize.getWidth(),height=doc.internal.pageSize.getHeight(),margin=36,rows=pdfRows(text),planned=[];let y=margin;
 for(let index=0;index<rows.length;index++){
  const row=rows[index];if(row.kind==='space'){if(rows[index+1]?.kind!=='heading')y+=size===11?3:2;continue;}
  const point=row.kind==='name'?18:row.kind==='heading'?11:row.kind==='contact'?Math.min(size,10):size;
  const weight=['name','heading'].includes(row.kind)?'bold':'normal';doc.setFont('Carlito',weight);doc.setFontSize(point);
  if(!supported(doc,row.text))throw Error('The embedded PDF font cannot safely render one or more characters. Export Word instead; no text was removed.');
  if(row.kind==='heading')y+=index?4:0;
  const markerX=margin+row.indent*10,indent=row.kind==='bullet'?Math.max(12,doc.getTextWidth(row.marker)+5):0,x=markerX+indent;
  const lines=doc.splitTextToSize(row.text,width-margin-x),leading=point*1.12;
  planned.push({...row,x,markerX,y:y+point,size:point,weight,lines,leading});y+=lines.length*leading+(row.kind==='name'?3:row.kind==='heading'?2:0);
 }
 return {rows:planned,size,font:'Carlito',height:y,fits:y<=height-margin,pageWidth:width,pageHeight:height,margin};
}
export async function createResumePdf(text,{requestedSize=11,jsPDF,fonts}={}){
 if(![11,10.5,10].includes(Number(requestedSize)))throw Error('Choose a readable 10–11 point body font.');
 const Constructor=jsPDF||await browserLibrary(),doc=new Constructor({unit:'pt',format:'a4',compress:true,putOnlyUsedFonts:true});
 fonts=fonts||{regular:await fontData('Carlito-Regular.ttf'),bold:await fontData('Carlito-Bold.ttf')};registerPdfFonts(doc,fonts);
 let layout;for(const size of [11,10.5,10].filter(n=>n<=Number(requestedSize))){const candidate=planResumePdf(doc,text,size);if(candidate.fits){layout=candidate;break;}}
 if(!layout)throw Error('This draft cannot fit one page at 10 pt. Approve further wording reductions before downloading; no content was removed.');
 doc.setTextColor(25,35,35);
 for(const row of layout.rows){doc.setFont('Carlito',row.weight);doc.setFontSize(row.size);
  if(row.marker){if(supported(doc,row.marker))doc.text(row.marker,row.markerX,row.y);else if(row.marker==='▪')doc.rect(row.markerX+1,row.y-5,3,3,'F');else if(row.marker==='‣')doc.triangle(row.markerX,row.y-6,row.markerX,row.y-1,row.markerX+4,row.y-3.5,'F');else doc.circle(row.markerX+2,row.y-3,row.marker==='●'?2:1.6,row.marker==='◦'?'S':'F');}
  row.lines.forEach((line,i)=>doc.text(line,row.x,row.y+i*row.leading));
 }
 if(doc.internal.getNumberOfPages()!==1)throw Error('PDF page-count validation failed. No file was downloaded.');
 doc.setProperties({title:'Resume',subject:'Approved application resume',creator:'NextRole'});
 return {bytes:new Uint8Array(doc.output('arraybuffer')),pageCount:1,font:layout.font,fontSize:layout.size,layout};
}

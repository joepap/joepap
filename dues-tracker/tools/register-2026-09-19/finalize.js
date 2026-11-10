const fs=require('fs');
const S=(process.env.REG_WORK || '/tmp/register-work/');
const DT='/home/user/joepap/dues-tracker';
const rows=JSON.parse(fs.readFileSync(S+'resolved.json','utf8'));
// read from the page image by eye, 10 Nov 2026
const EYE={'9:19':'00092196','12:2':'00097184','13:24':'00099966','26:4':'00084646','26:25':'00138937','34:15':'00091083','38:16':'00086148','38:32':'00093413','39:12':'00063738',
  // both reads agreed and were both wrong — the scan's 9 fools the reader the same way twice
  '3:11':'00029008','3:20':'00138939','3:23':'00089883','4:18':'00099989','14:11':'00093473','14:14':'00106194','14:19':'00031179','14:34':'00101069',
  '21:17':'00136709','27:36':'00129499','28:32':'00019280','45:14':'00032094','50:17':'00029002',
  // NEP's number is the typo here, not the scan: read enlarged from the page
  '5:3':'00022975','5:15':'00138947','22:14':'00090577','37:32':'00099959',
  // read enlarged and found right as first assigned
  '3:36':'00079233','5:33':'00004582','7:13':'00143796','7:28':'00055338','11:19':'00115723','11:35':'00106864','19:1':'00143865','24:19':'00139634',
  '24:23':'00115735','24:35':'00084616','33:34':'00130126','38:17':'00026734','39:7':'00070647','46:30':'00136702','48:30':'00143802','53:1':'00079231'};
const NAMEFIX={'26:25':['Korotcova','Anastasia',''],'26:4':['Kinard','Eriq','A'],'34:15':["O'Brien",'Cullen',''],'9:19':['Coates',"Q'Juan",'P'],
  '7:28':["Ca' Merono",'Chazzreno',''],'11:24':['Deavers','Warren','M'],'12:21':['Donnelly','David','R'],'17:5':['Gaskins','Oliver','W'],'17:16':['Gibson','Kendall','A'],
  '21:26':['Hill III','Joseph',''],'21:32':['Hinz','August','D'],'23:1':['Huskins','Michael','A.'],'24:4':['Johnson III','Eldon','Lloyd'],'25:5':['Jones','Marquet',''],
  '34:10':["O'Byrne",'Ian','C'],'39:36':['Scalise','Anthony',''],'51:6':['Zdobysz','Christopher','J'],'39:7':['Rust','Dominque','']};
const out=[];
for(const r of rows){
  const k=r.page+':'+r.line;
  let id=r.emplid, how=r.how;
  if(EYE[k]){ id=EYE[k]; how='read by eye from the page'; }
  if(!/^0\d{7}$/.test(id)) throw new Error('still unresolved: '+k+' '+r.name);
  let [ln,fn,mn]=[r.last_name,r.first_name,r.middle_name];
  if(NAMEFIX[k]) [ln,fn,mn]=NAMEFIX[k];
  // strip column debris the reader left on a few names
  ln=String(ln).replace(/\s*DU0?4.*$/i,'').trim(); mn=String(mn||'').replace(/\s*D[uU][A-Za-z0-9 ]*$/,'').replace(/\b8S$|\bS\$$/,'S').trim();
  const t=r.text;
  const amount = r.zero ? '0.00' : /\s-4\d[.,]\d\d\s/.test(t) ? '-49.19' : r.goal===99.19 ? '99.19' : /^KT-/.test(t) ? '50.00' : '49.19';
  out.push({page:r.page,line:r.line,emplid:id,last_name:ln,first_name:fn,middle_name:mn,amount,offCycle:/LA[AR] Y /.test(t),dept:(t.match(/^([A-Z]{2})-/)||[])[1]||'FB',how});
}
// Two lines the reader dropped altogether. Every full page prints 36 lines; pages
// 5 and 7 came back with 35. Both are read here from the page image.
out.push({page:5,line:25.5,emplid:'00004902',last_name:'Brimage Sr.',first_name:'Corey',middle_name:'Duane',amount:'49.19',offCycle:false,dept:'FB',how:'read by eye — the reader dropped this line'});
out.push({page:7,line:31.5,emplid:'00040412',last_name:'Campbell Jr.',first_name:'Cornelius',middle_name:'',amount:'49.19',offCycle:false,dept:'FB',how:'read by eye — the reader dropped this line'});
out.sort((a,b)=>a.page-b.page||a.line-b.line);
// every full page must carry the same number of lines
const perPage={}; out.forEach(r=>{perPage[r.page]=(perPage[r.page]||0)+1;});
const counts=Object.values(perPage); const full=counts.sort((a,b)=>counts.filter(v=>v===a).length-counts.filter(v=>v===b).length).pop();
const short=Object.entries(perPage).filter(([pg,n])=>n!==full).map(([pg,n])=>'p'+pg+'='+n);
console.log('lines per full page:',full,'| pages that differ:',short.join(' ')||'none','(the last page of a section is allowed to)');
// the answer key printed on the register
const fb=out.filter(r=>r.dept!=='KT');
// What the printed totals count, worked out the hard way: "Active Participants"
// is the number of lines with a POSITIVE deduction, "In-Active" the lines at
// zero, and a reversal line is in neither. The dollar total is the sum of every
// line, reversals included.
const pos=fb.filter(r=>Number(r.amount)>0).length, zer=fb.filter(r=>r.amount==='0.00').length, neg=fb.filter(r=>Number(r.amount)<0).length;
const cents=fb.reduce((a,r)=>a+Math.round(Number(r.amount)*100),0);
console.log('lines',out.length,'| FB positive',pos,'(printed 1806) | FB zero',zer,'(printed 9) | FB reversals',neg,'| FB all lines net $'+(cents/100).toFixed(2),'(printed 88838.76)');
if(pos!==1806||zer!==9||cents!==8883876) throw new Error('the reading does not match the register\'s printed totals');
const ids=new Map(); out.forEach(r=>ids.set(r.emplid,(ids.get(r.emplid)||[]).concat([r])));
const dup=[...ids].filter(([,g])=>g.length>1);
console.log('distinct payroll numbers:',ids.size,'| numbers on more than one line:',dup.map(([k,g])=>k+' x'+g.length+' '+g[0].last_name).join('; ')||'none');
const how={}; out.forEach(r=>{how[r.how]=(how[r.how]||0)+1;}); console.log(JSON.stringify(how,null,1));
fs.mkdirSync(DT+'/data/registers',{recursive:true});
fs.writeFileSync(DT+'/data/registers/register-2026-09-19.json',JSON.stringify({payPeriod:'2026-09-06..2026-09-19',checkDate:'2026-10-02',printed:{active:1806,inactive:9,otherAgency:1,fbDeduction:88838.76,vendorTotal:88888.76},rows:out},null,0));
// the first-read file carries the last four of each SSN in its raw text; the final file does not, so the first read goes
try{ fs.unlinkSync(DT+'/data/registers/register-2026-09-19.read1.json'); }catch(e){}
console.log('wrote data/registers/register-2026-09-19.json (no SSN digits in it)');

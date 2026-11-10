// Settle every payroll number on the register from three witnesses: the first
// read, the second read, and NEP (a number counts as confirmed by NEP only when
// the surname on that NEP record agrees with the surname on the register line).
const fs=require('fs');
const DT='/home/user/joepap/dues-tracker';
const t=require(DT+'/lib/tabular'), match=require(DT+'/lib/match');
const S=(process.env.REG_WORK || '/tmp/register-work/');
const L=v=>String(v==null?'':v).trim();
const num=v=>L(v).replace(/\D/g,'').replace(/^0+/,'');
const first=JSON.parse(fs.readFileSync(S+'ocr.json','utf8')).flatMap(p=>p.rows.map((r,i)=>({...r,page:p.page,line:i+1})));
const second=JSON.parse(fs.readFileSync(S+'second.json','utf8'));
const N=t.parseUpload(fs.readFileSync(DT+'/data/uploads/roster-72'),'x.xlsx').records;
const SUF=/\b(JR|SR|II|III|IV|V)\b/g;
const sur=s=>match.normalizeName(L(s)).replace(SUF,'').replace(/\s+/g,' ').trim();
const byPS=new Map(); for(const r of N){const k=num(r['PeopleSoft Number']); if(k) byPS.set(k,(byPS.get(k)||[]).concat([r]));}
const same=(h,row)=>{const a=sur(h['Last Name']), b=sur(row.last_name); return !!a&&!!b&&(a===b||a.startsWith(b)||b.startsWith(a));};
const nepSays=(id,row)=>(byPS.get(num(id))||[]).some(h=>same(h,row));
// When neither read lands on the right NEP record, look the member up by name:
// one NEP record of that surname and first name whose payroll number is a
// single digit away from one of the reads is the number the scan was showing.
const first1=s=>match.normalizeName(L(s)).split(' ')[0]||'';
const off1=(x,y)=>x.length===8&&y.length===8&&[...x].filter((c,i)=>c!==y[i]).length===1;
const nepByName=(row,reads)=>{ const c=N.filter(h=>same(h,row)&&first1(h['First Name'])===first1(row.first_name)&&num(h['PeopleSoft Number']));
  const ids=[...new Set(c.map(h=>L(h['PeopleSoft Number']).padStart(8,'0')))];
  const near=ids.filter(id=>reads.some(r=>r&&(r===id||off1(r,id))));
  return near.length===1?near[0]:''; };
const sKey=r=>r.page+':'+r.line; const sec=new Map(second.map(r=>[sKey(r),r]));
const out=[]; const tally={};
for(const r of first){
  const s=sec.get(sKey(r))||{second:''};
  const a=/^0\d{7}$/.test(r.emplid||'')?r.emplid:'', b=s.second||'';
  if(!a&&!b){ const byName=N.filter(h=>same(h,r)&&first1(h['First Name'])===first1(r.first_name)&&num(h['PeopleSoft Number']));
    const raw=(r.ocr_text.match(/x{2,3}\S*\s+\(?([0-9OD]{8,10})\b/i)||[])[1]||'';
    const digits=raw.replace(/[OD]/g,'0');
    const fit=byName.map(h=>L(h['PeopleSoft Number']).padStart(8,'0')).filter(id=>{ // the NEP number with one digit inserted gives the raw token
      for(let i=0;i<=digits.length;i++){ if(digits.slice(0,i)+digits.slice(i+1)===id) return true; } return digits.replace(/^0?/,'0')===id||('0'+digits)===id; });
    if(new Set(fit).size===1){ tally['NEP by name, scan shows it with a stray digit']=(tally['NEP by name, scan shows it with a stray digit']||0)+1;
      out.push({page:r.page,line:r.line,name:r.name,last_name:r.last_name,first_name:r.first_name,middle_name:r.middle_name,emplid:fit[0],how:'NEP by name, scan shows it with a stray digit',first:a,second:b,zero:!!r.zero_deduction,goal:r.amount_goal,text:r.ocr_text}); continue; } }
  let id='', how='';
  if(a&&a===b){ id=a; how=nepSays(a,r)?'both reads + NEP':'both reads'; }
  else if(a&&nepSays(a,r)){ id=a; how='first read + NEP'; }
  else if(b&&nepSays(b,r)){ id=b; how='second read + NEP'; }
  else if(nepByName(r,[a,b])){ id=nepByName(r,[a,b]); how='NEP by name, one digit from a read'; }
  else if(a&&!b){ id=a; how='ONE READ ONLY'; }
  else if(b&&!a){ id=b; how='ONE READ ONLY'; }
  else if(a&&b){ id=''; how='READS DISAGREE'; }
  else how='UNREAD';
  tally[how]=(tally[how]||0)+1;
  out.push({page:r.page,line:r.line,name:r.name,last_name:r.last_name,first_name:r.first_name,middle_name:r.middle_name,emplid:id,how,first:a,second:b,zero:!!r.zero_deduction,goal:r.amount_goal,text:r.ocr_text});
}
console.log(JSON.stringify(tally,null,1));
fs.writeFileSync(S+'resolved.json',JSON.stringify(out));
const open=out.filter(r=>/ONE READ|DISAGREE|UNREAD/.test(r.how));
console.log('\nto read by eye:',open.length,'on pages',[...new Set(open.map(r=>r.page))].join(','));
open.forEach(r=>console.log('  p'+String(r.page).padStart(2)+' l'+String(r.line).padStart(2)+'  '+r.name.padEnd(30)+' first='+(r.first||'-').padEnd(9)+' second='+(r.second||'-').padEnd(9)+' '+r.how));

const fs=require('node:fs');
const cp=require('node:child_process');
const assert=require('node:assert/strict');
const adb=process.env.DAYBOOK_ADB||'adb';
const serial=process.env.DAYBOOK_DEVICE||'127.0.0.1:16384';
function shell(...args){return cp.execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true});}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(){const pid=shell('shell','pidof','cn.local.daybook').trim();shell('forward','tcp:9223','localabstract:webview_devtools_remote_'+pid);const tabs=await fetch('http://127.0.0.1:9223/json').then(r=>r.json());const ws=new WebSocket(tabs.find(t=>t.url.includes('daybook.local')).webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let seq=0;const pending=new Map();ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});const evaluate=async(expression)=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};return{evaluate,command,close:()=>ws.close()};}
async function main(){let c=await connect();const evalJS=expr=>c.evaluate(expr);let passed=0;const check=(name,value)=>{assert(value,name);passed++;console.log('PASS '+name);};
if(process.argv[2]==='eval'){console.log(JSON.stringify(await evalJS(process.argv[3]),null,2));c.close();return;}
if(process.argv[2]==='restart'){const before=await evalJS('JSON.parse(Native.list()).data');c.close();shell('shell','am','force-stop','cn.local.daybook');shell('shell','am','start','-n','cn.local.daybook/.MainActivity');await pause(2000);c=await connect();const after=await evalJS('JSON.parse(Native.list()).data');assert.deepEqual(after,before);console.log('PASS Android process restart preserves SQLite records: '+after.length);c.close();return;}
check('App loaded on real Android',await evalJS('!!window.Native && !!document.querySelector(".hero")'));
const before=await evalJS('JSON.parse(Native.list()).data.map(e=>e.id)');
await evalJS('document.querySelector("[data-action=add][data-type=expense]").click()');
check('Default date follows device local date',await evalJS('document.querySelector("#entry-date").value===Ledger.today()'));
await evalJS('document.querySelector("#amount").value="0";document.querySelector("[data-action=save]").click()');
check('Reject zero expense',await evalJS('document.querySelector("#form-error").textContent.length>0'));
await evalJS('document.querySelector("#amount").value="28.50";document.querySelector("#entry-note").value="QA 午餐";document.querySelector("[data-action=save]").click()');
check('Expense saved through actual form',await evalJS('JSON.parse(Native.list()).data.some(e=>e.cents===2850&&e.note==="QA 午餐")'));
const id=await evalJS('JSON.parse(Native.list()).data.find(e=>e.note==="QA 午餐").id');
await evalJS(`document.querySelector('[data-id="${id}"]').click();document.querySelector('#amount').value='32.80';document.querySelector('[data-action=save]').click()`);
check('Edit updates same record',await evalJS(`JSON.parse(Native.list()).data.find(e=>e.id==='${id}').cents===3280`));
const testRows=[['salary','income',850000,'2026-10-05','工资','QA 十月工资'],['coffee','expense',1800,'2026-10-09','餐饮','QA 午后一杯咖啡'],['ride','expense',600,'2026-10-08','交通','QA 地铁出行'],['shopping','expense',15900,'2026-10-07','购物','QA 秋日小物'],['oldmonth','expense',9900,'2026-09-30','居家','QA 跨月测试'],['oldyear','income',50000,'2025-12-31','奖金','QA 跨年测试']].map(([id,type,cents,date,category,note])=>({id:'qa_'+id,type,cents,date,category,note,createdAt:'2026-10-09T06:00:00Z'}));
for(const row of testRows){check('Native SQLite write '+row.id,await evalJS(`JSON.parse(Native.save(${JSON.stringify(JSON.stringify(row))})).ok`));}
const invalid={...testRows[0],id:'qa_invalid',cents:0};check('Native rejects invalid money',!(await evalJS(`JSON.parse(Native.save(${JSON.stringify(JSON.stringify(invalid))})).ok`)));
invalid.cents=100;invalid.date='2026-02-29';check('Native rejects invalid date',!(await evalJS(`JSON.parse(Native.save(${JSON.stringify(JSON.stringify(invalid))})).ok`)));
await evalJS('load();month="2026-10";year="2026";tab="stats";mode="month";render();window.scrollTo(0,0)');
check('Monthly totals exclude adjacent month/year',await evalJS('Ledger.totals(Ledger.filter(rows,"2026-10")).income===850000'));
check('All 31 daily rows shown',await evalJS('document.querySelectorAll(".detail-row").length===31'));
await evalJS('document.querySelector("[data-action=mode][data-value=year]").click()');
check('Annual mode has 12 months',await evalJS('document.querySelectorAll(".detail-row").length===12'));
await evalJS('document.querySelectorAll(".bar-group")[8].click()');
check('Annual month drilldown',await evalJS('mode==="month"&&month==="2026-09"'));
const ids=await evalJS(`JSON.parse(Native.list()).data.map(e=>e.id).filter(id=>!${JSON.stringify(before)}.includes(id))`);fs.writeFileSync('work/test-records.json',JSON.stringify(ids));
await evalJS('tab="home";month="2026-10";year="2026";render();window.scrollTo(0,0)');
check('No horizontal overflow',await evalJS('document.documentElement.scrollWidth<=window.innerWidth'));
console.log(passed+' device tests passed');c.close();}
if(require.main===module)main().catch(err=>{console.error(err);process.exit(1);});
else module.exports={connect,shell};

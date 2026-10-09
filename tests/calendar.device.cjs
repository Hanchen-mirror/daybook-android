const fs=require('node:fs');
const assert=require('node:assert/strict');
const {connect,shell}=require('./device.cjs');
async function main(){
  const c=await connect(), evaluate=c.evaluate;
  const marker='QA calendar '+Date.now();
  const before=await evaluate('JSON.parse(Native.list()).data');
  fs.writeFileSync('work/v101-before.json',JSON.stringify(before));
  let passed=0;
  function check(name,condition){assert(condition,name);passed++;console.log('PASS '+name);}
  try{
    await evaluate('document.querySelector("[data-action=tab][data-value=calendar]").click()');
    check('日历导航显示七列月历',await evaluate('!!document.querySelector(".calendar-grid")&&getComputedStyle(document.querySelector(".calendar-grid")).gridTemplateColumns.split(" ").length===7'));
    check('默认选中设备今天',await evaluate('calendarDay===Ledger.today()&&document.querySelector(".calendar-day.today").dataset.date===Ledger.today()'));
    await evaluate('month="2024-02";render();document.querySelector(".calendar-day[data-date=\\"2024-02-29\\"]").click()');
    check('闰日可选且明细日期同步',await evaluate('calendarDay==="2024-02-29"&&document.querySelector("[data-action=add]").dataset.date==="2024-02-29"'));
    await evaluate('document.querySelector("[data-action=add][data-type=expense]").click()');
    check('从日历补记采用选中日期',await evaluate('document.querySelector("#entry-date").value==="2024-02-29"'));
    await evaluate(`document.querySelector('#amount').value='12.34';document.querySelector('#entry-note').value=${JSON.stringify(marker)};document.querySelector('[data-action=save]').click()`);
    check('保存后保留日历页与选中日期',await evaluate('tab==="calendar"&&month==="2024-02"&&calendarDay==="2024-02-29"'));
    check('格内准确展示支出并显示账单',await evaluate(`document.querySelector('.calendar-day.selected .expense').textContent==='−12.34'&&document.querySelector('.entry-text small').textContent===${JSON.stringify(marker)}`));
    await evaluate(`document.querySelector('[data-action=add][data-type=income]').click();document.querySelector('#amount').value='100.01';document.querySelector('#entry-note').value=${JSON.stringify(marker)};document.querySelector('[data-action=save]').click()`);
    check('同日收入支出与两笔计数',await evaluate('document.querySelector(".calendar-day.selected .income").textContent==="+100.01"&&document.querySelector(".calendar-day.selected .calendar-count").textContent==="2 笔"'));
    await evaluate('document.querySelector("[data-action=period][data-dir=\\"1\\"]").click()');
    check('跨月选择自动落在有效日期',await evaluate('month==="2024-03"&&calendarDay==="2024-03-01"'));
    await evaluate('month="2026-03";render()');
    check('六周月份日期没有遗漏',await evaluate('document.querySelector(".calendar-grid").children.length===42&&document.querySelectorAll(".calendar-day").length===31'));
    await evaluate('month="2026-12";render();document.querySelector("[data-action=period][data-dir=\\"1\\"]").click()');
    check('十二月向后切换到次年一月',await evaluate('month==="2027-01"&&calendarDay==="2027-01-01"'));
    await evaluate('document.querySelector("[data-action=calendar-today]").click()');
    check('回到今天恢复当前月和日',await evaluate('calendarDay===Ledger.today()&&month===Ledger.today().slice(0,7)'));
    for(const width of [320,360,390,600]){
      await c.command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:true});
      check(width+'px 无横向溢出',await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    }
    await c.command('Emulation.clearDeviceMetricsOverride');
    console.log(passed+' calendar device tests passed');
  } finally {
    await c.command('Emulation.clearDeviceMetricsOverride').catch(()=>{});
    await evaluate(`JSON.parse(Native.list()).data.filter(e=>e.note===${JSON.stringify(marker)}).forEach(e=>Native.remove(e.id));load();close();tab='calendar';month=Ledger.today().slice(0,7);calendarDay=Ledger.today();render();window.scrollTo(0,0)`);
    const after=await evaluate('JSON.parse(Native.list()).data');
    assert.deepEqual(after,before,'用户账单必须原样保留');
    console.log('PASS 测试完成后用户账单原样保留');
    c.close();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});

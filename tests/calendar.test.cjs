const assert=require('node:assert/strict');
const L=require('../assets/ledger.js');
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
test('周一开始的 28 天月历恰好四行',()=>{const c=L.calendar([],'2021-02');assert.equal(c.length,28);assert.equal(c[0].date,'2021-02-01');assert.equal(c[27].date,'2021-02-28');});
test('周日开月保留六个前导空格与六周布局',()=>{const c=L.calendar([],'2026-03');assert.equal(c.length,42);assert(c.slice(0,6).every(v=>v===null));assert.equal(c[6].date,'2026-03-01');assert.equal(c.filter(Boolean).length,31);});
test('闰年二月包含 29 日',()=>{const c=L.calendar([],'2024-02');assert.equal(c.length,35);assert.equal(c[3].date,'2024-02-01');assert.equal(c.filter(Boolean).at(-1).date,'2024-02-29');});
test('世纪年份 1900 年不是闰年，2000 年是闰年',()=>{assert.equal(L.calendar([],'1900-02').filter(Boolean).length,28);assert.equal(L.calendar([],'2000-02').filter(Boolean).length,29);});
test('上下限月份',()=>{assert.equal(L.calendar([],'1900-01').filter(Boolean).length,31);assert.equal(L.calendar([],'9999-12').filter(Boolean).length,31);});
test('同日收支汇总与条数、相邻月份排除',()=>{const rows=[{type:'expense',cents:10,date:'2026-10-09'},{type:'expense',cents:20,date:'2026-10-09'},{type:'income',cents:10001,date:'2026-10-09'},{type:'expense',cents:99999,date:'2026-09-30'}];const d=L.calendar(rows,'2026-10').find(d=>d&&d.date==='2026-10-09');assert.deepEqual(d,{date:'2026-10-09',number:9,income:10001,expense:30,balance:9971,count:3});});
test('空白日期为零收支',()=>{const c=L.calendar([],'2026-10');assert(c.filter(Boolean).every(d=>d.income===0&&d.expense===0&&d.count===0));});
test('月份校验',()=>{for(const m of ['2026-13','2026-00','1899-12','2026-1','not-a-month'])assert.throws(()=>L.calendar([],m));});
test('金额简写与精确分',()=>{assert.equal(L.compactMoney(1),'0.01');assert.equal(L.compactMoney(1200),'12');assert.equal(L.compactMoney(123456),'1.2千');assert.equal(L.compactMoney(1234567),'1.2万');assert.equal(L.compactMoney(10000000000),'1.0亿');});
console.log(count+' calendar tests passed');

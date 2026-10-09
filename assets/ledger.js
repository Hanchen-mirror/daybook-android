(function (root) {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
  const money = cents => (cents / 100).toLocaleString('zh-CN', {minimumFractionDigits:2, maximumFractionDigits:2});
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function parseAmount(value) {
    if(!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(value)) throw Error('请输入金额，最多两位小数');
    const [yuan, fen=''] = value.split('.'); const cents = Number(yuan)*100 + Number(fen.padEnd(2,'0'));
    if(cents < 1 || cents > 99999999999) throw Error('金额须在 0.01 至 999,999,999.99 元之间');
    return cents;
  }
  function validDate(date) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1900-01-01') return false;
    const [y,m,d]=date.split('-').map(Number), dt=new Date(y,m-1,d);
    return dt.getFullYear()===y && dt.getMonth()===m-1 && dt.getDate()===d;
  }
  function totals(rows) { return rows.reduce((s,e) => { s[e.type]+=e.cents; s.balance=s.income-s.expense; return s; },{income:0,expense:0,balance:0}); }
  function filter(rows, prefix) { return rows.filter(e=>e.date.startsWith(prefix)); }
  function buckets(rows, prefix, yearly=false) {
    let count=yearly?12:new Date(Number(prefix.slice(0,4)),Number(prefix.slice(5,7)),0).getDate();
    return Array.from({length:count},(_,i)=>{ const key=prefix+'-'+pad(i+1); return {key,label:String(i+1),...totals(filter(rows,key))}; });
  }
  function backup(rows, scope) { return JSON.stringify({app:'daybook',schemaVersion:1,currency:'CNY',exportedAt:new Date().toISOString(),scope,entries:rows},null,2); }
  function csv(rows) {
    const quote = value => { let s=String(value); if(/^[\s]*[=+\-@]/.test(s)) s="'"+s; return '"'+s.replace(/"/g,'""')+'"'; };
    return '\uFEFF' + [['编号','日期','类型','分类','金额（元）','备注','创建时间'],...rows.map(e=>[e.id,e.date,e.type==='income'?'收入':'支出',e.category,(e.cents/100).toFixed(2),e.note,e.createdAt])].map(row=>row.map(quote).join(',')).join('\r\n');
  }
  function report(rows,scope) {
    const t=totals(rows), esc=escape;
    return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>日常账本 · ${esc(scope)}</title><style>body{font:15px/1.7 system-ui,'Microsoft YaHei',sans-serif;color:#303849;margin:40px auto;max-width:1000px;padding:0 24px}small{color:#9099aa}h1{font-size:30px}.summary{display:flex;gap:32px;padding:24px;background:#f1f7ff;border-radius:16px;margin:24px 0}.summary b{display:block;font-size:24px;color:#337ecc}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px 8px;border-bottom:1px solid #e8ecf3}th{background:#f6f8fc}td:last-child{overflow-wrap:anywhere;max-width:280px}.expense{color:#de795d}.income{color:#3f9a76}@media print{body{margin:0}tr{break-inside:avoid}thead{display:table-header-group}}@media(max-width:600px){body{padding:12px;margin:0}.summary{gap:12px;flex-wrap:wrap}td,th{font-size:12px;padding:8px 3px}}</style><small>DAYBOOK / 本地生活账本</small><h1>日常账本 · ${esc(scope)}</h1><p>币种：人民币 CNY · ${rows.length} 笔账单 · 导出于 ${esc(new Date().toLocaleString('zh-CN'))}</p><div class="summary"><div>总收入<b>¥ ${money(t.income)}</b></div><div>总支出<b>¥ ${money(t.expense)}</b></div><div>结余<b>¥ ${money(t.balance)}</b></div></div><table><thead><tr><th>日期</th><th>类型</th><th>分类</th><th>金额（元）</th><th>备注</th></tr></thead><tbody>${rows.map(e=>`<tr><td>${esc(e.date)}</td><td class="${e.type}">${e.type==='income'?'收入':'支出'}</td><td>${esc(e.category)}</td><td>${money(e.cents)}</td><td>${esc(e.note)}</td></tr>`).join('')||'<tr><td colspan="5">该时段暂无账单</td></tr>'}</tbody></table><p><small>结余 = 收入 − 支出。此报告为导出时的快照，完整备份与恢复请使用 JSON 文件。</small></p></html>`;
  }
  function calendar(rows, month) {
    if(!/^\d{4}-\d{2}$/.test(month) || !validDate(month+'-01')) throw Error('月份无效');
    const [year, number]=month.split('-').map(Number);
    const leading=(new Date(year,number-1,1).getDay()+6)%7;
    const days=new Date(year,number,0).getDate();
    const grouped=new Map();
    filter(rows,month+'-').forEach(e=>{
      let day=grouped.get(e.date);
      if(!day){day={income:0,expense:0,balance:0,count:0};grouped.set(e.date,day);}
      day[e.type]+=e.cents;day.count++;day.balance=day.income-day.expense;
    });
    const length=Math.ceil((leading+days)/7)*7;
    return Array.from({length},(_,i)=>{
      const number=i-leading+1;
      if(number<1||number>days)return null;
      const date=month+'-'+pad(number);
      return {date,number,...(grouped.get(date)||{income:0,expense:0,balance:0,count:0})};
    });
  }
  function compactMoney(cents) {
    const yuan=cents/100;
    if(yuan>=100000000)return (yuan/100000000).toFixed(1)+'亿';
    if(yuan>=10000)return (yuan/10000).toFixed(1)+'万';
    if(yuan>=1000)return (yuan/1000).toFixed(1)+'千';
    return yuan.toFixed(2).replace(/\.00$/,'');
  }
  const api={pad,today,money,escape,parseAmount,validDate,totals,filter,buckets,backup,csv,report,calendar,compactMoney};
  if(typeof module!=='undefined') module.exports=api; else root.Ledger=api;
})(this);

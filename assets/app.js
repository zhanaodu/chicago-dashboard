"use strict";
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const valid = (value) => typeof value === "number" && Number.isFinite(value);
const fmt = (value) => valid(value) ? new Intl.NumberFormat("zh-CN", {maximumFractionDigits:2}).format(value) : "—";
const pct = (value) => valid(value) ? `${(value * 100).toFixed(1)}%` : "—";
const sum = (rows, field) => { const numbers = rows.map((r) => r[field]).filter(valid); return numbers.length ? numbers.reduce((a,b) => a+b,0) : null; };
const shiftDay = (day, amount) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate()+amount); return date.toISOString().slice(0,10); };
const validDay = (day) => /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T12:00:00Z`)) && shiftDay(day,0)===day;
const boundedDay = (day,first,last) => validDay(day) ? (day<first?first:day>last?last:day) : last;
const params = new URLSearchParams(location.search);
const state = {data:null,start:params.get("start")||"",end:params.get("end")||"",line:params.get("line")||"",mode:"day"};

function notice(message) { $("message").textContent=message; $("message").hidden=!message; }
function sourceTime(value) { const parsed = new Date(value); return Number.isNaN(parsed.valueOf()) ? value : new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(parsed); }

async function loadData() {
  $("refreshData").disabled=true;
  try {
    const response=await fetch(`./assets/data.json?t=${Date.now()}`,{cache:"no-store"});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    if(data.schemaVersion!==2 || !Array.isArray(data.snapshots) || !data.snapshots.length) throw new Error("数据格式尚未更新");
    data.snapshots.sort((a,b)=>a.date.localeCompare(b.date));
    state.data=data;
    const first=data.snapshots[0].date, last=data.snapshots.at(-1).date;
    state.start=boundedDay(state.start,first,last); state.end=boundedDay(state.end,first,last);
    if(state.start>state.end)state.start=state.end;
    state.mode=state.start===state.end?'day':'custom';
    for(const id of ["startDate","endDate"]) {$(id).min=first;$(id).max=last;}
    const lines=[...new Set(data.snapshots.flatMap((s)=>s.processes.map((p)=>p.line)))].sort();
    $("lineSelect").innerHTML='<option value="">全部产线</option>'+lines.map((line)=>`<option value="${esc(line)}">${esc(line)}</option>`).join("");
    if(!lines.includes(state.line)) state.line="";
    $("lineSelect").value=state.line;
    $("syncLabel").textContent=`同步 ${sourceTime(data.syncedAt)} · 北京时间`;
    $("sourceLabel").textContent=`${data.source.name} · ${data.snapshotCount} 个记录日 · ${first} 至 ${last}`;
    notice(""); render();
  } catch(error) {
    notice(`读取失败：${error.message}。${state.data ? "已保留上次成功加载的数据。" : "请稍后点击更新看板重试。"}`);
  } finally {$("refreshData").disabled=false;}
}

function rowsFor(snapshot) {return snapshot.processes.filter((p)=>!state.line||p.line===state.line).map((p)=>({...p,date:snapshot.date}));}
function performance(rows) {
  const targeted=rows.filter((r)=>valid(r.actual)&&valid(r.target)&&r.target>0);
  const staffed=rows.filter((r)=>valid(r.actual)&&valid(r.fte)&&r.fte>0);
  return {rate:targeted.length?sum(targeted,"actual")/sum(targeted,"target"):null,perPerson:staffed.length?sum(staffed,"actual")/sum(staffed,"fte"):null,targeted:targeted.length};
}
function roleTotal(rows, pattern) {return sum(rows.filter((p)=>pattern.test(p.name)),"actual");}
function stockTotal(snapshot) {
  return snapshot.skuRows.length && snapshot.skuRows.every((r)=>valid(r.closing)) ? sum(snapshot.skuRows,"closing") : null;
}
function metric(label,value,note) {return `<article class="metric"><span class="label">${label}</span><strong>${value}</strong><small>${note}</small></article>`;}
function cells(values) {return values.map((v)=>`<td>${v}</td>`).join("");}
function saveRange() {
  const url=new URL(location.href);url.search="";
  url.searchParams.set("start",state.start);url.searchParams.set("end",state.end);
  if(state.line) url.searchParams.set("line",state.line);
  history.replaceState(null,"",url);
}

function render() {
  if(!state.data) return;
  $("startDate").value=state.start;$("endDate").value=state.end;
  document.querySelectorAll("[data-mode]").forEach((b)=>b.classList.toggle("active",b.dataset.mode===state.mode));
  saveRange();
  const days=state.data.snapshots.filter((s)=>s.date>=state.start&&s.date<=state.end);
  $("rangeLabel").textContent=`${state.start} 至 ${state.end} · ${days.length} 个记录日 · ${state.line||"全部产线"}`;
  if(!days.length) {
    notice("所选范围没有日记录。未将无记录日期补成零。");
    ["metrics","lineCards","processRows","skuRows","dailyRows","issueRows","inventoryChart","flowChart","outputChart"].forEach((id)=>$(id).replaceChildren());
    $("dailyCount").textContent="0 个记录日";$("qualitySummary").textContent="无记录";$("issuesSummary").textContent="无核对事项";return;
  }
  const procs=days.flatMap(rowsFor), inventory=days.flatMap((d)=>d.skuRows);
  const summary=performance(procs), latest=days.at(-1), lastStock=stockTotal(latest);
  $("metrics").innerHTML=[
    metric("期末库存 · 全仓",fmt(lastStock),`${latest.date} · 件`),
    metric("入库 · 已录入",fmt(sum(inventory,"inbound")),`${inventory.filter((r)=>valid(r.inbound)).length}/${inventory.length} 条 SKU 日记录有数值`),
    metric("出库 · 已录入",fmt(sum(inventory,"outbound")),`${inventory.filter((r)=>valid(r.outbound)).length}/${inventory.length} 条 SKU 日记录有数值`),
    metric("维修输出",fmt(roleTotal(procs,/维修/)),"工序件次 · 按产线筛选"),
    metric("打包输出",fmt(roleTotal(procs,/打包/)),"含翻新与退运 · 按产线筛选"),
    metric("有效目标达标率",pct(summary.rate),`${summary.targeted} 条产出与正目标成对记录`),
    metric("实际工作人日",fmt(sum(procs,"fte")),"按各工序折算时长累计，非去重人数")
  ].join("");
  const timeline=[];const lookup=new Map(days.map((d)=>[d.date,d]));
  for(let d=state.start;d<=state.end;d=shiftDay(d,1)) timeline.push({date:d,record:lookup.get(d)});
  chart("inventoryChart",timeline,[{name:"期末库存",color:"#ffda27",read:(s)=>stockTotal(s)}]);
  chart("flowChart",timeline,[{name:"入库（已录入）",color:"#ffda27",read:(s)=>sum(s.skuRows,"inbound")},{name:"出库（已录入）",color:"#84d7b5",read:(s)=>sum(s.skuRows,"outbound")}]);
  chart("outputChart",timeline,[{name:"维修",color:"#ffda27",read:(s)=>roleTotal(rowsFor(s),/维修/)},{name:"打包",color:"#8bc6f5",read:(s)=>roleTotal(rowsFor(s),/打包/)}]);
  renderLines(procs);renderStock(days);renderDaily(days);renderIssues(days);
}

function chart(id,days,series) {
  const width=Math.max(320,$(id).clientWidth,days.length*92+80),height=230,pad={left:52,right:28,top:40,bottom:35};
  const values=series.map((s)=>days.map((d)=>d.record?s.read(d.record):null));
  const maximum=Math.max(1,...values.flat().filter(valid))*1.14;
  const x=(i)=>days.length===1?width/2:pad.left+i*(width-pad.left-pad.right)/(days.length-1);
  const y=(v)=>height-pad.bottom-v/maximum*(height-pad.top-pad.bottom);
  let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(series.map((s)=>s.name).join('、'))}每日数值" style="min-width:${width}px">`;
  for(let i=0;i<=4;i++) {const v=maximum*i/4;svg+=`<line x1="${pad.left}" x2="${width-pad.right}" y1="${y(v)}" y2="${y(v)}" stroke="#2c2e31"/><text x="${pad.left-8}" y="${y(v)+4}" text-anchor="end" fill="#909497" font-size="10">${fmt(Math.round(v))}</text>`;}
  series.forEach((s,k)=>{
    let active=false,path="";
    values[k].forEach((v,i)=>{if(!valid(v)){active=false;return;}path+=`${active?'L':'M'}${x(i)},${y(v)} `;active=true;});
    svg+=`<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.5"/>`;
    values[k].forEach((v,i)=>{
      if(!valid(v)) return;
      const near=k>0&&valid(values[0][i])&&Math.abs(y(values[0][i])-y(v))<24;
      const labelY=near?y(v)+18:y(v)-12;
      svg+=`<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${s.color}"><title>${days[i].date} ${esc(s.name)}：${fmt(v)}</title></circle><text x="${x(i)}" y="${labelY}" text-anchor="middle" fill="${s.color}" font-size="11">${fmt(v)}</text>`;
    });
  });
  days.forEach((d,i)=>svg+=`<text x="${x(i)}" y="${height-6}" text-anchor="middle" fill="${d.record?'#b7babd':'#62666a'}" font-size="10">${d.date.slice(5)}</text>`);
  svg+='</svg>';
  $(id).innerHTML=`<div class="legend">${series.map((s)=>`<span><i style="background:${s.color}"></i>${s.name}</span>`).join("")}</div><div class="chart-scroll">${svg}</div>`;
  const container=$(id).querySelector(".chart-scroll");container.scrollLeft=container.scrollWidth;
}

function renderLines(rows) {
  const lines=[...new Set(rows.map((r)=>r.line))];
  $("lineCards").innerHTML=lines.length?lines.map((line)=>{
    const selected=rows.filter((r)=>r.line===line);const p=performance(selected);
    return `<article class="line-card"><h3>${esc(line)}</h3><span class="subtle">有效目标达标率 <b class="${p.rate>=1?'good':'warn'}">${pct(p.rate)}</b> · ${p.targeted} 条有效记录</span><div class="line-kpis"><span>维修<b>${fmt(roleTotal(selected,/维修/))}</b></span><span>打包<b>${fmt(roleTotal(selected,/打包/))}</b></span><span>实际工作人日<b>${fmt(sum(selected,'fte'))}</b></span></div></article>`;
  }).join(""):'<p class="empty">所选产线在此范围没有记录</p>';
  const groups=new Map();
  rows.forEach((r)=>{const key=JSON.stringify([r.line,r.name]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);});
  $("processRows").innerHTML=[...groups.values()].map((list)=>{
    const p=performance(list);
    const notes=list.filter((r)=>r.note).map((r)=>`${r.date} ${r.note}`).join('；');
    return `<tr>${cells([esc(list[0].line),esc(list[0].name),`${list.filter((r)=>valid(r.actual)).length} / ${list.length}`,fmt(sum(list,'fte')),fmt(sum(list,'target')),fmt(sum(list,'actual')),fmt(p.perPerson),`<span class="${p.rate>=1?'good':p.rate!==null?'warn':'muted'}">${pct(p.rate)}</span>`,esc(notes)||'—'])}</tr>`;
  }).join("");
}

function renderStock(days) {
  const names=[...new Set(days.flatMap((d)=>d.skuRows.map((r)=>r.sku)))];
  $("skuRows").innerHTML=names.map((sku)=>{
    const list=days.flatMap((d)=>d.skuRows.filter((r)=>r.sku===sku));
    const opening=days[0].skuRows.find((r)=>r.sku===sku)?.opening;
    const closing=days.at(-1).skuRows.find((r)=>r.sku===sku)?.closing;
    const delta=valid(opening)&&valid(closing)?closing-opening:null;
    const anomalies=list.filter((r)=>valid(r.balanceDelta)&&Math.abs(r.balanceDelta)>.001).length;
    const note=days.at(-1).skuRows.find((r)=>r.sku===sku)?.note;
    return `<tr>${cells([esc(sku),fmt(opening),fmt(sum(list,'inbound')),fmt(sum(list,'outbound')),fmt(closing),fmt(delta),anomalies?`<span class="warn">${anomalies} 条</span>`:'<span class="muted">—</span>',esc(note)||'—'])}</tr>`;
  }).join("");
}

function renderDaily(days) {
  $("dailyCount").textContent=`${days.length} 个记录日`;
  $("dailyRows").innerHTML=[...days].reverse().map((s)=>{
    const rows=rowsFor(s);
    return `<tr>${cells([`<button class="date-button" data-date="${s.date}">${s.date}</button>`,fmt(stockTotal(s)),fmt(sum(s.skuRows,'inbound')),fmt(sum(s.skuRows,'outbound')),fmt(roleTotal(rows,/维修/)),fmt(roleTotal(rows,/打包/)),pct(performance(rows).rate),`${s.issues.length} 项`])}</tr>`;
  }).join("");
}

function renderIssues(days) {
  const issues=days.flatMap((s)=>s.issues.map((i)=>({...i,date:s.date}))).sort((a,b)=>b.date.localeCompare(a.date)||a.row-b.row);
  const selected=issues.filter((i)=>!$("issueType").value||i.kind===$("issueType").value);
  const balance=issues.filter((i)=>i.kind==='balance').length, calc=issues.filter((i)=>i.kind==='calculation').length;
  $("qualitySummary").textContent=`全仓及全部产线：${issues.length} 项，其中库存差异 ${balance} 项、重算人效差异 ${calc} 项。空值和公式错误不补零；未修改飞书源表。`;
  $("issuesSummary").textContent=`展开核对事项（${selected.length} 项）`;
  $("issueRows").innerHTML=selected.map((i)=>`<tr>${cells([i.date,esc(i.subject),`<a href="${esc(state.data.source.url)}&range=A${i.row}:Q${i.row}" target="_blank" rel="noopener">第 ${i.row} 行 ↗</a>`,esc(i.message)])}</tr>`).join("");
}

document.querySelectorAll("[data-mode]").forEach((button)=>button.addEventListener("click",()=>{
  if(!state.data)return;state.mode=button.dataset.mode;
  state.end=state.data.snapshots.at(-1).date;
  state.start=state.mode==='all'?state.data.snapshots[0].date:shiftDay(state.end,state.mode==='week'?-6:state.mode==='month'?-29:0);
  notice("");render();
}));
for(const id of ["startDate","endDate"]) $(id).addEventListener("change",()=>{
  if(!$(id).value||!state.data)return;state.mode='custom';state[id==='startDate'?'start':'end']=boundedDay($(id).value,state.data.snapshots[0].date,state.data.snapshots.at(-1).date);
  if(state.start>state.end) {if(id==='startDate')state.end=state.start;else state.start=state.end;}
  notice("");render();
});
$("lineSelect").addEventListener("change",()=>{state.line=$("lineSelect").value;render();});
$("issueType").addEventListener("change",render);
$("dailyRows").addEventListener("click",(event)=>{const b=event.target.closest('[data-date]');if(!b)return;state.start=state.end=b.dataset.date;state.mode='day';render();window.scrollTo({top:0,behavior:'smooth'});});
$("refreshData").addEventListener("click",loadData);
$("syncFeishu").addEventListener("click",()=>{
  const url=new URL('http://127.0.0.1:8794/refresh');url.searchParams.set('mode','redirect');url.searchParams.set('origin',location.origin);url.searchParams.set('return',location.href);location.assign(url);
});
$("exportData").addEventListener("click",()=>{
  if(!state.data)return;
  const snapshots=state.data.snapshots.filter((s)=>s.date>=state.start&&s.date<=state.end).map((s)=>({...s,processes:rowsFor(s)}));
  const blob=new Blob([JSON.stringify({source:state.data.source,syncedAt:state.data.syncedAt,scope:{start:state.start,end:state.end,line:state.line||'全部产线',inventory:'全仓'},snapshots},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`chicago-${state.start}-${state.end}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
loadData();

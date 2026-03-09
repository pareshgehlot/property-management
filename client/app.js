const apiBase = '/api';

function getToken(){ return localStorage.getItem('pm_token'); }
function setToken(t){ if(t) localStorage.setItem('pm_token', t); else localStorage.removeItem('pm_token'); }

async function api(path, opts={}) {
  opts.headers = opts.headers || {};
  const token = getToken();
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// UI helpers
const el = id => document.getElementById(id);
const propsList = el('propsList');
const addForm = el('addForm');
const dashboard = el('dashboard');
const home = el('home');
const backBtn = el('back');
const propName = el('propName');
const chartCtx = el('chart').getContext('2d');
let currentProp = null;
let chart = null;

async function loadProps(){
  const props = await api(apiBase + '/properties');
  propsList.innerHTML = '';
  for (const p of props){
    const li = document.createElement('li');
    li.innerHTML = `<span>${p.name}</span>`;
    const v = document.createElement('button'); v.textContent='View'; v.onclick=()=>openDashboard(p);
    const d = document.createElement('button'); d.textContent='Delete'; d.onclick=async()=>{ if(confirm('Delete?')){ await api(apiBase+`/properties/${p.id}`,{method:'DELETE'}); loadProps(); } };
    li.appendChild(v); li.appendChild(d);
    propsList.appendChild(li);
  }
}

addForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const name = el('name').value.trim();
  const icsUrl = el('icsUrl').value.trim();
  if(!name || !icsUrl) return alert('enter name and ics');
  try{
    await api(apiBase + '/properties', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({name, icsUrl})});
  }catch(err){ alert('Add property failed: ' + err.message); }
  el('name').value=''; el('icsUrl').value='';
  loadProps();
});

backBtn.addEventListener('click', ()=>{ dashboard.classList.add('hidden'); home.classList.remove('hidden'); if(chart) chart.destroy(); chart=null; currentProp=null; });

function monthTitle(d){ return d.toLocaleString(undefined,{month:'long', year:'numeric'}); }

function renderCalendar(container, year, month, bookingsSet){
  // month is 0-based
  const mDate = new Date(year, month, 1);
  const title = monthTitle(mDate);
  const monthDiv = document.createElement('div'); monthDiv.className='month';
  monthDiv.innerHTML = `<h3>${title}</h3>`;
  const weekdays = document.createElement('div'); weekdays.className='weekdays';
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(w=>{ const c=document.createElement('div'); c.className='cell'; c.textContent=w; weekdays.appendChild(c); });
  monthDiv.appendChild(weekdays);
  const days = document.createElement('div'); days.className='days';
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  for(let i=0;i<firstDay;i++){ const c=document.createElement('div'); c.className='cell'; days.appendChild(c); }
  for(let d=1; d<=daysInMonth; d++){
    const dt = new Date(year, month, d);
    const key = dt.toISOString().slice(0,10);
    const c = document.createElement('div'); c.className='cell day'; c.textContent=d;
    if(bookingsSet.has(key)) c.classList.add('booked');
    const today = new Date(); if(dt.toDateString()===today.toDateString()) c.classList.add('today');
    days.appendChild(c);
  }
  monthDiv.appendChild(days);
  container.appendChild(monthDiv);
}

function buildBookingsSet(events, fromDate, toDate){
  const set = new Set();
  for(const e of events){
    const s = new Date(e.start); const en = new Date(e.end);
    // clamp
    const start = s > fromDate ? s : fromDate;
    const end = en < toDate ? en : toDate;
    for(let d = new Date(start); d < end; d.setDate(d.getDate()+1)){
      set.add(d.toISOString().slice(0,10));
    }
  }
  return set;
}

let calBase = new Date(); // shows starting month

async function openDashboard(prop){
  currentProp = prop;
  home.classList.add('hidden'); dashboard.classList.remove('hidden');
  propName.textContent = prop.name;
  calBase = new Date();
  await loadAndRender();
}

// Login handling
const loginForm = el('loginForm');
const loginDiv = el('login');
loginForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const username = el('username').value.trim();
  const password = el('password').value;
  try{
    const res = await fetch(apiBase + '/login', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({username, password})});
    if(!res.ok) throw new Error(await res.text());
    const data = await res.json();
    setToken(data.token);
    loginDiv.classList.add('hidden');
    home.classList.remove('hidden');
    loadProps();
  }catch(err){ alert('Login failed: ' + err.message); }
});

// show login if not authenticated
function ensureAuthUI(){ if(getToken()){ loginDiv.classList.add('hidden'); home.classList.remove('hidden'); loadProps(); } else { loginDiv.classList.remove('hidden'); home.classList.add('hidden'); } }

ensureAuthUI();

async function loadAndRender(){
  const p = currentProp;
  if(!p) return;
  // Graph: fetch appropriate range
  const range = el('graphRange').value;
  let from, to;
  const now = new Date();
  if(range==='this'){
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = new Date(now.getFullYear(), now.getMonth()+1, 1);
  } else if(range==='next2'){
    from = new Date(now.getFullYear(), now.getMonth()+1, 1);
    to = new Date(now.getFullYear(), now.getMonth()+3, 1);
  } else {
    const f = el('from').value; const t = el('to').value;
    if(!f || !t) { alert('choose from/to'); return; }
    from = new Date(f); to = new Date(t); to.setDate(to.getDate()+1);
  }
  const q = `?from=${from.toISOString().slice(0,10)}&to=${to.toISOString().slice(0,10)}`;
  let bookings;
  try{ const res = await api(apiBase+`/properties/${p.id}/bookings${q}`); bookings = res.events; }
  catch(e){ alert('No bookings cached yet - try Refresh'); bookings = []; }

  // build daily counts for chart
  const labels = [];
  const data = [];
  for(let d=new Date(from); d<to; d.setDate(d.getDate()+1)){
    labels.push(d.toISOString().slice(0,10)); data.push(0);
  }
  for(const b of bookings){
    const s=new Date(b.start), en=new Date(b.end);
    for(let d=new Date(s); d<en; d.setDate(d.getDate()+1)){
      const key = d.toISOString().slice(0,10);
      const idx = labels.indexOf(key);
      if(idx>=0) data[idx] = data[idx] + 1;
    }
  }

  if(chart) chart.destroy();
  chart = new Chart(chartCtx, {type:'bar', data:{labels, datasets:[{label:'Booked units', data, backgroundColor:'#3182ce'}]}});

  // calendars: current month and next month, and navigation controls (allow up to 2 years ahead)
  const cal = el('calendar'); cal.innerHTML='';
  const a = new Date(calBase);
  const b = new Date(calBase.getFullYear(), calBase.getMonth()+1, 1);
  const calFrom = new Date(a.getFullYear(), a.getMonth(), 1);
  const calTo = new Date(b.getFullYear(), b.getMonth()+1, 1);
  // fetch bookings spanning these two months
  const q2 = `?from=${calFrom.toISOString().slice(0,10)}&to=${new Date(calTo.getFullYear(), calTo.getMonth(), 1).toISOString().slice(0,10)}`;
  let evts = [];
  try{ const res2 = await api(apiBase+`/properties/${p.id}/bookings${q2}`); evts = res2.events; } catch(e){ evts = []; }
  const set = buildBookingsSet(evts, calFrom, calTo);
  renderCalendar(cal, a.getFullYear(), a.getMonth(), set);
  renderCalendar(cal, b.getFullYear(), b.getMonth(), set);
  el('calTitle').textContent = `${monthTitle(a)} — ${monthTitle(b)}`;
}

el('graphRange').addEventListener('change', ()=>{ const v=el('graphRange').value; if(v==='range'){ el('customRange').classList.remove('hidden'); el('customRange2').classList.remove('hidden'); } else { el('customRange').classList.add('hidden'); el('customRange2').classList.add('hidden'); } });

el('refreshBookings').addEventListener('click', async ()=>{
  if(!currentProp) return;
  try{
    const res = await api(apiBase + `/properties/${currentProp.id}/refresh`, {method:'POST'});
    alert('Refresh completed: ' + (res.count||0) + ' events');
    loadAndRender();
  }catch(err){ alert('Refresh failed: ' + err.message); }
});

el('prev').addEventListener('click', ()=>{ calBase = new Date(calBase.getFullYear(), calBase.getMonth()-1, 1); loadAndRender(); });
el('next').addEventListener('click', ()=>{ const max = new Date(); max.setFullYear(max.getFullYear()+2); const candidate = new Date(calBase.getFullYear(), calBase.getMonth()+1,1); if(candidate<=max) { calBase = candidate; loadAndRender(); } else alert('Max 2 years ahead'); });

// initial
loadProps();

import { Component, OnInit, OnDestroy } from '@angular/core';
import { ApiService } from './api.service';
import Chart from 'chart.js/auto';
import { ConfirmModalComponent } from './confirm-modal/confirm-modal.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'Property Management';
  username = '';
  password = '';
  properties: any[] = [];
  propertySearch: string = '';
  filteredProperties: any[] = [];
  selectedId: string = '';
  name = '';
  icsUrl = '';
  token = '';
  selected: any = null;
  currentEvents: any[] = [];
  // charts
  barChart: any = null;
  pieChart: any = null;
  // calendar & range
  calBase: Date = new Date();
  calTitle = '';
  rangeMode: string = 'this';
  customFrom: string = '';
  customTo: string = '';
  statusMap: any = {};
  
  // booking detail modal
  bookingDetailVisible: boolean = false;
  selectedBooking: any = null;

  constructor(private api: ApiService) {}

  ngOnInit(){
    const t = localStorage.getItem('pm_token');
    if(t) this.token = t;
    if(this.token) this.loadProps();
  }

  ngOnDestroy(){ if(this.barChart) this.barChart.destroy(); if(this.pieChart) this.pieChart.destroy(); }

  async login(){
    try{
      const res: any = await this.api.login(this.username, this.password).toPromise();
      if(res && res.token){ localStorage.setItem('pm_token', res.token); this.token = res.token; this.loadProps(); }
    }catch(err){ alert('Login failed'); }
  }

  async loadProps(){
    try{ this.properties = (await this.api.getProperties().toPromise()) || []; }
    catch(e){ console.error(e); this.properties = []; }
    // fetch simple status counts for properties (best-effort)
    for(const p of this.properties){
      try{ const sres: any = await this.api.getBookings(p.id).toPromise(); this.statusMap[p.id] = { count: (sres.events||[]).length }; } catch(e){ /* ignore */ }
    }
    // initialize filtered list - DO NOT auto-select first property
    this.filteredProperties = [...this.properties];
    this.selectedId = '';
  }

  onSearchChange(){
    const q = (this.propertySearch || '').toLowerCase().trim();
    if(!q) { this.filteredProperties = [...this.properties]; return; }
    const chars = q.split('');
    const match = (s: string) => {
      const t = (s || '').toLowerCase();
      if(t.includes(q)) return true; // substring
      // fuzzy: all characters present (order not required)
      return chars.every(ch => t.indexOf(ch) >= 0);
    };
    this.filteredProperties = this.properties.filter(p => match(p.name) || match(p.id) || match(p.icsUrl));
  }

  onSelectChange(ev: any){
    const id = this.selectedId;
    const p = this.properties.find(x => x.id === id);
    if(p){ this.viewProp(p); }
  }

  async addProp(){
    try{ await this.api.addProperty(this.name, this.icsUrl).toPromise(); this.name=''; this.icsUrl=''; this.loadProps(); }
    catch(e){ alert('Add failed'); }
  }

  confirmVisible: boolean = false;
  confirmTargetId: string | null = null;
  confirmMessage: string = '';

  deleteProp(id: string){
    // open bootstrap confirm modal
    this.confirmTargetId = id;
    this.confirmMessage = 'Delete this property? This will remove it from the list.';
    this.confirmVisible = true;
  }

  async onConfirmModal(result: boolean){
    if(result && this.confirmTargetId){
      try{ await this.api.deleteProperty(this.confirmTargetId).toPromise(); this.loadProps(); }
      catch(e){ alert('Delete failed'); }
    }
    this.confirmVisible = false; this.confirmTargetId = null;
  }

  

  async viewProp(p: any){ this.selected = p; this.calBase = new Date(); await this.renderDashboard(); }

  // helper used by the bootstrap dropdown selection
  onAutocompleteSelected(id: string){
    const p = this.properties.find(x => x.id === id);
    if(p){ this.viewProp(p); }
  }

  // helper to view property by id (avoid arrow function in template)
  viewPropById(id: string | null){
    if(!id) return;
    const p = this.properties.find(x => x.id === id);
    if(p) this.viewProp(p);
  }

  // reset the property search/filter and show all properties
  resetPropertyFilter(){
    this.propertySearch = '';
    this.filteredProperties = [...this.properties];
  }

  // edit modal state
  editVisible: boolean = false;
  editId: string | null = null;
  editName: string = '';
  editIcsUrl: string = '';

  openEdit(p: any){
    if(!p) return;
    this.editId = p.id; this.editName = p.name; this.editIcsUrl = p.icsUrl; this.editVisible = true;
  }

  async onEditClose(result: { id: string|null, name: string, icsUrl: string } | null){
    this.editVisible = false;
    if(!result) return; // cancelled
    try{
      if(result.id){
        await this.api.updateProperty(result.id, result.name, result.icsUrl).toPromise();
        // reload properties and re-render
        await this.loadProps();
        if(this.selected && this.selected.id === result.id) this.viewProp(this.properties.find(x=>x.id===result.id));
      }
    }catch(e){ alert('Update failed'); }
  }

  async refresh(){ if(!this.selected) return; await this.api.refreshProperty(this.selected.id).toPromise(); alert('Refresh requested'); this.renderDashboard(); }

  async renderDashboard(){
    if(!this.selected) return;
    // determine date range
    const now = new Date();
    let fromDate: Date; let toDate: Date;
    if(this.rangeMode === 'this'){
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
      toDate = new Date(now.getFullYear(), now.getMonth()+1, 1);
    } else if(this.rangeMode === 'next2'){
      fromDate = new Date(now.getFullYear(), now.getMonth()+1, 1);
      toDate = new Date(now.getFullYear(), now.getMonth()+3, 1);
    } else {
      if(this.customFrom && this.customTo){ fromDate = new Date(this.customFrom); toDate = new Date(this.customTo); toDate.setDate(toDate.getDate()+1); } else { fromDate = new Date(now.getFullYear(), now.getMonth(), 1); toDate = new Date(now.getFullYear(), now.getMonth()+1, 1); }
    }
    const qFrom = fromDate.toISOString().slice(0,10); const qTo = toDate.toISOString().slice(0,10);
    let res: any = null;
    try{ res = await this.api.getBookings(this.selected.id, qFrom, qTo).toPromise(); } catch(e){ res = { events: [] }; }
  const events = (res && res.events) ? res.events : [];
  this.currentEvents = events;

    // build daily counts for bar chart
    const labels: string[] = [];
    const data: number[] = [];
    for(let d = new Date(fromDate); d < toDate; d.setDate(d.getDate()+1)){
      labels.push(d.toISOString().slice(0,10)); data.push(0);
    }
    for(const e of events){
      const s = new Date(e.start); const en = new Date(e.end);
      for(let d=new Date(s); d<en; d.setDate(d.getDate()+1)){
        const key = d.toISOString().slice(0,10);
        const idx = labels.indexOf(key); if(idx>=0) data[idx]++;
      }
    }
    // render bar chart
    const barCtx = (document.getElementById('chartBar') as HTMLCanvasElement).getContext('2d');
    if(this.barChart) this.barChart.destroy();
    this.barChart = new Chart(barCtx!, { type: 'bar', data: { labels, datasets: [{ label: 'Booked units', data, backgroundColor: '#3182ce' }] } });

    // pie chart booked vs available
    const totalDays = labels.length;
    let bookedDays = 0; for(const v of data) if(v>0) bookedDays++;
    const availDays = Math.max(0, totalDays - bookedDays);
    const pieCtx = (document.getElementById('chartPie') as HTMLCanvasElement).getContext('2d');
    if(this.pieChart) this.pieChart.destroy();
    this.pieChart = new Chart(pieCtx!, { type: 'pie', data: { labels: ['Booked','Available'], datasets: [{ data: [bookedDays, availDays], backgroundColor: ['#f56565','#48bb78'] }] } });

    // CalendarComponent will render calendars based on currentEvents and calBase
  }

  renderCalendars(base: Date, events: any[]){
    const container = document.getElementById('calendarContainer'); if(!container) return; container.innerHTML = '';
    const a = new Date(base.getFullYear(), base.getMonth(), 1);
    const b = new Date(base.getFullYear(), base.getMonth()+1, 1);
    this.calTitle = `${a.toLocaleString(undefined,{month:'long',year:'numeric'})} — ${b.toLocaleString(undefined,{month:'long',year:'numeric'})}`;
    const calFrom = new Date(a.getFullYear(), a.getMonth(), 1);
    const calTo = new Date(b.getFullYear(), b.getMonth()+1, 1);
    const bookingsSet = this.buildBookingsSet(events, calFrom, calTo);
    this.renderCalendar(container, a.getFullYear(), a.getMonth(), bookingsSet);
    this.renderCalendar(container, b.getFullYear(), b.getMonth(), bookingsSet);
  }

  renderCalendar(container: HTMLElement, year: number, month: number, bookingsSet: Set<string>){
    const monthDiv = document.createElement('div'); monthDiv.style.background='#fff'; monthDiv.style.padding='8px'; monthDiv.style.border='1px solid #e2e8f0'; monthDiv.style.borderRadius='6px'; monthDiv.style.width='320px';
    const title = document.createElement('h3'); title.style.textAlign='center'; title.style.margin='4px 0'; title.textContent = new Date(year, month, 1).toLocaleString(undefined,{month:'long', year:'numeric'});
    monthDiv.appendChild(title);
    const weekdays = document.createElement('div'); weekdays.style.display='grid'; weekdays.style.gridTemplateColumns='repeat(7,1fr)'; weekdays.style.gap='4px'; ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(w=>{ const c=document.createElement('div'); c.style.height='28px'; c.style.display='flex'; c.style.alignItems='center'; c.style.justifyContent='center'; c.style.fontSize='12px'; c.textContent=w; weekdays.appendChild(c); });
    monthDiv.appendChild(weekdays);
    const days = document.createElement('div'); days.style.display='grid'; days.style.gridTemplateColumns='repeat(7,1fr)'; days.style.gap='4px';
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    for(let i=0;i<firstDay;i++){ const c=document.createElement('div'); c.style.height='36px'; days.appendChild(c); }
    for(let d=1; d<=daysInMonth; d++){
      const dt = new Date(year, month, d);
      const key = dt.toISOString().slice(0,10);
      const c = document.createElement('div'); c.style.height='36px'; c.style.display='flex'; c.style.alignItems='center'; c.style.justifyContent='center'; c.style.borderRadius='4px'; c.textContent = String(d);
      if(bookingsSet.has(key)) { c.style.background='#f56565'; c.style.color='#fff'; }
      else { c.style.background='#48bb78'; c.style.color='#fff'; }
      const today = new Date(); if(dt.toDateString()===today.toDateString()) { c.style.outline='2px solid #63b3ed'; }
      days.appendChild(c);
    }
    monthDiv.appendChild(days);
    container.appendChild(monthDiv);
  }

  buildBookingsSet(events: any[], fromDate: Date, toDate: Date){
    const set = new Set<string>();
    for(const e of events){
      const s = new Date(e.start); const en = new Date(e.end);
      const start = s > fromDate ? s : fromDate;
      const end = en < toDate ? en : toDate;
      for(let d = new Date(start); d < end; d.setDate(d.getDate()+1)){
        set.add(d.toISOString().slice(0,10));
      }
    }
    return set;
  }

  onCalendarChange(delta: number){
    if(!delta) return;
    const candidate = new Date(this.calBase.getFullYear(), this.calBase.getMonth() + delta, 1);
    const max = new Date(); max.setFullYear(max.getFullYear()+2);
    if(candidate <= max){ this.calBase = candidate; this.renderDashboard(); }
    else alert('Max 2 years ahead');
  }

  resetRange(){ this.rangeMode = 'this'; this.customFrom = ''; this.customTo = ''; this.renderDashboard(); }

  // open booking detail modal
  viewBooking(booking: any){
    this.selectedBooking = booking;
    this.bookingDetailVisible = true;
  }

  logout(){
    localStorage.removeItem('pm_token');
    this.token = '';
    this.username = '';
    this.password = '';
    this.properties = [];
    this.selected = null;
  }
}

import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';

interface DayCell { date: Date; iso: string; inMonth: boolean; booked: boolean; isToday: boolean; bookings: any[] }

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css']
})
export class CalendarComponent implements OnChanges {
  @Input() events: any[] = [];
  @Input() baseDate: Date = new Date();
  @Output() changeMonth = new EventEmitter<number>(); // -1 or +1
  @Output() selectBooking = new EventEmitter<any>(); // emit booking when clicked

  monthA: { year: number; month: number; title: string; weeks: DayCell[] } | null = null;
  monthB: { year: number; month: number; title: string; weeks: DayCell[] } | null = null;

  get months(){
    return [this.monthA, this.monthB].filter(x => !!x) as { year: number; month: number; title: string; weeks: DayCell[] }[];
  }

  ngOnChanges(changes: SimpleChanges){
    this.buildMonths();
  }

  private computeBookingsSet(fromDate: Date, toDate: Date){
    const set = new Set<string>();
    console.log('ComputeBookingsSet - this.events:', this.events);
    for(const e of this.events || []){
      const s = new Date(e.start); const en = new Date(e.end);
      const start = s > fromDate ? s : fromDate;
      const end = en < toDate ? en : toDate;
      for(let d = new Date(start); d < end; d.setDate(d.getDate()+1)){
        set.add(d.toISOString().slice(0,10));
      }
    }
    console.log('ComputeBookingsSet - result set:', set);
    return set;
  }

  private buildMonths(){
    const a = new Date(this.baseDate.getFullYear(), this.baseDate.getMonth(), 1);
    const b = new Date(this.baseDate.getFullYear(), this.baseDate.getMonth()+1, 1);
    const calFrom = new Date(a.getFullYear(), a.getMonth(), 1);
    const calTo = new Date(b.getFullYear(), b.getMonth()+1, 1);
    const bookings = this.computeBookingsSet(calFrom, calTo);
    this.monthA = { year: a.getFullYear(), month: a.getMonth(), title: a.toLocaleString(undefined,{month:'long',year:'numeric'}), weeks: this.buildMonthCells(a.getFullYear(), a.getMonth(), bookings) };
    this.monthB = { year: b.getFullYear(), month: b.getMonth(), title: b.toLocaleString(undefined,{month:'long',year:'numeric'}), weeks: this.buildMonthCells(b.getFullYear(), b.getMonth(), bookings) };
  }

  private buildMonthCells(year: number, month: number, bookings: Set<string>){
    const cells: DayCell[] = [];
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    // leading blanks
    for(let i=0;i<firstDay;i++) cells.push({ date: new Date(year, month, i - firstDay + 1), iso: '', inMonth: false, booked:false, isToday:false, bookings: [] });
    for(let d=1; d<=daysInMonth; d++){
      const dt = new Date(year, month, d);
      const iso = dt.toISOString().slice(0,10);
      const isToday = dt.toDateString() === new Date().toDateString();
      // find bookings for this date
      const dayBookings = this.events.filter(e => {
        const s = new Date(e.start);
        const en = new Date(e.end);
        const checkDate = new Date(iso);
        const isBooked = checkDate >= s && checkDate < en;
        return isBooked;
      });
      const isBooked = bookings.has(iso);
      console.log(`Date ${iso}: bookings.has=${isBooked}, dayBookings.length=${dayBookings.length}, computed=${isBooked ? 'BOOKED' : 'AVAILABLE'}`);
      cells.push({ date: dt, iso, inMonth: true, booked: isBooked, isToday, bookings: dayBookings });
    }
    // pad to full weeks
    while(cells.length % 7 !== 0) cells.push({ date: new Date(year, month, daysInMonth+1), iso: '', inMonth: false, booked:false, isToday:false, bookings: [] });
    return cells;
  }

  onPrev(){ this.changeMonth.emit(-1); }
  onNext(){ this.changeMonth.emit(1); }

  onDayClick(cell: DayCell){
    if(cell.bookings.length > 0){
      this.selectBooking.emit(cell.bookings[0]);
    }
  }

  // expose for unit tests
  public _computeBookingsSetForTests(fromDate: Date, toDate: Date){ return this.computeBookingsSet(fromDate, toDate); }
}

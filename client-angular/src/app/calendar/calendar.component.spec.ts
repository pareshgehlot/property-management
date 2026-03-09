import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CalendarComponent } from './calendar.component';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

describe('CalendarComponent', () => {
  let component: CalendarComponent;
  let fixture: ComponentFixture<CalendarComponent>;

  beforeEach(async () => {
  await TestBed.configureTestingModule({ declarations: [ CalendarComponent ], schemas: [CUSTOM_ELEMENTS_SCHEMA] }).compileComponents();
    fixture = TestBed.createComponent(CalendarComponent);
    component = fixture.componentInstance;
  });

  it('should compute bookings set across date ranges', () => {
    component.events = [{ start: '2026-03-05T00:00:00Z', end: '2026-03-07T00:00:00Z' }];
    const from = new Date('2026-03-01');
    const to = new Date('2026-04-01');
    const set = component._computeBookingsSetForTests(from, to);
    expect(set.has('2026-03-05')).toBeTrue();
    expect(set.has('2026-03-06')).toBeTrue();
    expect(set.has('2026-03-07')).toBeFalse();
  });

  it('should emit changeMonth on prev/next', () => {
    spyOn(component.changeMonth, 'emit');
    component.onPrev();
    expect(component.changeMonth.emit).toHaveBeenCalledWith(-1);
    component.onNext();
    expect(component.changeMonth.emit).toHaveBeenCalledWith(1);
  });
});

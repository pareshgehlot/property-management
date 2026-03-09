import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { AppComponent } from './app.component';
import { CalendarComponent } from './calendar/calendar.component';
import { ConfirmModalComponent } from './confirm-modal/confirm-modal.component';
import { EditModalComponent } from './edit-modal/edit-modal.component';
import { BookingDetailComponent } from './booking-detail/booking-detail.component';

@NgModule({
  declarations: [
    AppComponent,
    CalendarComponent,
    ConfirmModalComponent,
    EditModalComponent,
    BookingDetailComponent
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }

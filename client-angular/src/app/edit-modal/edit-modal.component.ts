import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-edit-modal',
  templateUrl: './edit-modal.component.html',
  styleUrls: ['./edit-modal.component.css']
})
export class EditModalComponent {
  @Input() name: string = '';
  @Input() icsUrl: string = '';
  @Input() id: string | null = null;
  @Output() close = new EventEmitter<{ id: string|null, name: string, icsUrl: string } | null>();

  onCancel(){ this.close.emit(null); }
  onSave(){ this.close.emit({ id: this.id, name: this.name, icsUrl: this.icsUrl }); }
}

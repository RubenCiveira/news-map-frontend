import { Component, Inject } from '@angular/core';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-detail-sheet',
  imports: [CommonModule, MatBottomSheetModule],
  template: `
    <div class="sheet">
      <div class="sheet-body" [innerHTML]="data.html"></div>
    </div>
  `,
  styles: [`
    .sheet { padding: 16px; }
    .sheet-body { max-height: 70vh; overflow: auto; }
    .sheet-body table { width: 100%; border-collapse: collapse; }
    .sheet-body th, .sheet-body td { border: 1px solid rgba(0,0,0,.15); padding: 4px 6px; }
  `]
})
export class DetailSheetComponent {
  constructor(@Inject(MAT_BOTTOM_SHEET_DATA) public data: { html: string }) {}
}

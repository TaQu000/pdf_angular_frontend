import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ParsedResult } from './services/pdf-upload.service';

@Component({
  selector: 'parsed-data-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>description</mat-icon>
      {{ data.filename }}
    </h2>
    <mat-dialog-content>
      <div class="parsed-data-content">
        <pre>{{ data.data | json }}</pre>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2 {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    mat-icon {
      color: #3f51b5;
    }

    .parsed-data-content {
      max-height: 60vh;
      overflow: auto;
    }

    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 13px;
      background: #f5f5f5;
      padding: 16px;
      border-radius: 4px;
      line-height: 1.6;
    }
  `]
})
export class ParsedDataDialog {
  protected data = inject<ParsedResult>(MAT_DIALOG_DATA);
}

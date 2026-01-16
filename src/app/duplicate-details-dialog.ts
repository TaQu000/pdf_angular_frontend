import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { DuplicateEntry } from './services/pdf-upload.service';

interface TableRow {
  field: string;
  value: any;
}

@Component({
  selector: 'duplicate-details-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule
  ],
  template: `
    <h2 mat-dialog-title>Duplicate Comparison Results</h2>

    <mat-dialog-content>
      <div class="summary-section">
        <p><strong>File 1:</strong> {{ data.file1 }}</p>
        <p><strong>File 2:</strong> {{ data.file2 }}</p>
        <p><strong>{{ data.comparison.total_fields_compared }} Entries analyzed</strong></p>
        <p><strong>{{ data.comparison.matching_fields }} Entries have the exact same value</strong></p>
        <p><strong>% Duplicate = {{ data.comparison.duplicate_percentage | number:'1.0-1' }}</strong></p>
      </div>

      @if (data.comparison.matching_values.length > 0) {
        <div class="table-section">
          <h3>Matching Values</h3>
          <div class="comparison-table-container">
            <table class="comparison-table">
              <thead>
                <tr>
                  <th>{{ data.file1 }}</th>
                  <th>{{ data.file2 }}</th>
                </tr>
              </thead>
              <tbody>
                @for (row of tableRows; track row.field) {
                  <tr>
                    <td>
                      <span class="field-name">{{ formatFieldName(row.field) }}</span>
                      <span class="field-value">{{ formatValue(row.value) }}</span>
                    </td>
                    <td>
                      <span class="field-name">{{ formatFieldName(row.field) }}</span>
                      <span class="field-value">{{ formatValue(row.value) }}</span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      @if (data.comparison.differing_values.length > 0) {
        <div class="table-section differing">
          <h3>Differing Values</h3>
          <div class="comparison-table-container">
            <table class="comparison-table">
              <thead>
                <tr>
                  <th>{{ data.file1 }}</th>
                  <th>{{ data.file2 }}</th>
                </tr>
              </thead>
              <tbody>
                @for (diff of data.comparison.differing_values; track diff.field) {
                  <tr>
                    <td>
                      <span class="field-name">{{ formatFieldName(diff.field) }}</span>
                      <span class="field-value">{{ formatValue(diff.value1) }}</span>
                    </td>
                    <td>
                      <span class="field-name">{{ formatFieldName(diff.field) }}</span>
                      <span class="field-value different">{{ formatValue(diff.value2) }}</span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-raised-button color="primary" (click)="close()">Close</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .summary-section {
      margin-bottom: 24px;
      padding: 16px;
      background: #f5f5f5;
      border-radius: 4px;
    }

    .summary-section p {
      margin: 8px 0;
    }

    .table-section {
      margin-bottom: 24px;
    }

    .table-section h3 {
      margin-bottom: 12px;
      color: #333;
    }

    .table-section.differing h3 {
      color: #f44336;
    }

    .comparison-table-container {
      max-height: 400px;
      overflow-y: auto;
      border: 1px solid #ddd;
      border-radius: 4px;
    }

    .comparison-table {
      width: 100%;
      border-collapse: collapse;
    }

    .comparison-table th {
      position: sticky;
      top: 0;
      background: #3f51b5;
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: 500;
      width: 50%;
    }

    .comparison-table td {
      padding: 8px 12px;
      border-bottom: 1px solid #eee;
      vertical-align: top;
    }

    .comparison-table tr:nth-child(even) td {
      background: #fafafa;
    }

    .comparison-table tr:hover td {
      background: #e8eaf6;
    }

    .field-name {
      display: block;
      font-size: 11px;
      color: #666;
      margin-bottom: 2px;
    }

    .field-value {
      display: block;
      font-weight: 500;
      word-break: break-word;
    }

    .field-value.different {
      color: #f44336;
    }

    mat-dialog-content {
      max-height: 70vh;
    }
  `]
})
export class DuplicateDetailsDialog {
  data = inject<DuplicateEntry>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<DuplicateDetailsDialog>);

  get tableRows(): TableRow[] {
    return this.data.comparison.matching_values;
  }

  formatFieldName(field: string): string {
    // Convert field path to human-readable format
    // e.g., "dimensional_verification.average_measurements.shute_mm" -> "Shute (mm)"
    const lastPart = field.split('.').pop() || field;
    return lastPart
      .replace(/_/g, ' ')
      .replace(/\[(\d+)\]/g, ' $1')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  formatValue(value: any): string {
    if (value === null || value === undefined) {
      return '-';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  close(): void {
    this.dialogRef.close();
  }
}

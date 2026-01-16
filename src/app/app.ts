import { Component, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { PdfUploadService, PdfFile, ComparisonResult, DuplicateEntry } from './services/pdf-upload.service';
import { DuplicateDetailsDialog } from './duplicate-details-dialog';

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatProgressBarModule,
    MatListModule,
    MatIconModule,
    MatSnackBarModule,
    MatTableModule,
    MatTabsModule,
    MatDialogModule
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  @ViewChild('folderInput') folderInput!: ElementRef<HTMLInputElement>;

  private pdfUploadService = inject(PdfUploadService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  protected pdfFiles = signal<PdfFile[]>([]);
  protected isUploading = signal(false);
  protected isScanning = signal(false);
  protected isFinalizing = signal(false);
  protected uploadProgress = signal({ total: 0, completed: 0 });
  protected comparisonResult = signal<ComparisonResult | null>(null);

  // Check if native directory picker is supported (Chrome/Edge)
  protected supportsDirectoryPicker = this.pdfUploadService.isDirectoryPickerSupported();

  protected progressPercent = computed(() => {
    const progress = this.uploadProgress();
    if (progress.total === 0) return 0;
    return Math.round((progress.completed / progress.total) * 100);
  });

  protected hasFiles = computed(() => this.pdfFiles().length > 0);

  protected statusIcon(status: PdfFile['status']): string {
    switch (status) {
      case 'pending': return 'schedule';
      case 'uploading': return 'cloud_upload';
      case 'success': return 'check_circle';
      case 'error': return 'error';
    }
  }

  protected statusColor(status: PdfFile['status']): string {
    switch (status) {
      case 'pending': return '';
      case 'uploading': return 'accent';
      case 'success': return 'primary';
      case 'error': return 'warn';
    }
  }

  protected formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async selectFolder(): Promise<void> {
    if (this.supportsDirectoryPicker) {
      // Use native directory picker (Chrome/Edge)
      try {
        this.isScanning.set(true);
        const pdfs = await this.pdfUploadService.selectDirectory();
        this.pdfFiles.set(pdfs);
        this.uploadProgress.set({ total: pdfs.length, completed: 0 });

        if (pdfs.length === 0) {
          this.snackBar.open('No PDF files found in selected folder', 'Dismiss', { duration: 3000 });
        }
      } catch (err: any) {
        // User cancelled or error
        if (err.name !== 'AbortError') {
          this.snackBar.open('Error selecting folder: ' + err.message, 'Dismiss', { duration: 3000 });
        }
      } finally {
        this.isScanning.set(false);
      }
    } else {
      // Fallback to webkitdirectory input (Firefox, etc.)
      this.folderInput.nativeElement.click();
    }
  }

  onFolderSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const pdfs = this.pdfUploadService.filterPdfFiles(input.files);
    this.pdfFiles.set(pdfs);
    this.uploadProgress.set({ total: pdfs.length, completed: 0 });

    if (pdfs.length === 0) {
      this.snackBar.open('No PDF files found in selected folder', 'Dismiss', { duration: 3000 });
    }

    // Reset input so same folder can be selected again
    input.value = '';
  }

  uploadAll(): void {
    const files = this.pdfFiles();
    if (files.length === 0) return;

    this.isUploading.set(true);
    this.comparisonResult.set(null);

    this.pdfUploadService.uploadPdfs(files).subscribe({
      next: ({ progress }) => {
        this.uploadProgress.set(progress);
        // Trigger change detection by creating new array
        this.pdfFiles.set([...files]);
      },
      complete: () => {
        this.isUploading.set(false);
        const successCount = files.filter(f => f.status === 'success').length;
        const errorCount = files.filter(f => f.status === 'error').length;

        let message = `Upload complete: ${successCount} succeeded`;
        if (errorCount > 0) {
          message += `, ${errorCount} failed`;
        }
        this.snackBar.open(message, 'Dismiss', { duration: 3000 });

        // Finalize session to get comparison results
        if (successCount > 0) {
          this.finalizeSession();
        }
      },
      error: (err) => {
        this.isUploading.set(false);
        this.snackBar.open('Upload failed: ' + err.message, 'Dismiss', { duration: 5000 });
      }
    });
  }

  private finalizeSession(): void {
    this.isFinalizing.set(true);
    this.pdfUploadService.finalizeSession().subscribe({
      next: (result) => {
        this.comparisonResult.set(result);
        this.isFinalizing.set(false);
        this.snackBar.open(
          `Analysis complete: ${result.total_files} files, ${result.duplicates_found} duplicates found`,
          'Dismiss',
          { duration: 5000 }
        );
      },
      error: (err) => {
        this.isFinalizing.set(false);
        this.snackBar.open('Finalize failed: ' + (err.error?.error || err.message), 'Dismiss', { duration: 5000 });
      }
    });
  }

  clearFiles(): void {
    this.pdfFiles.set([]);
    this.uploadProgress.set({ total: 0, completed: 0 });
    this.comparisonResult.set(null);
  }

  protected openDuplicateDetails(duplicate: DuplicateEntry): void {
    this.dialog.open(DuplicateDetailsDialog, {
      width: '800px',
      maxHeight: '80vh',
      data: duplicate
    });
  }
}

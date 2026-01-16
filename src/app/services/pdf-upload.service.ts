import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, from, mergeMap, map, catchError, of, throwError } from 'rxjs';

export interface PdfFile {
  file: File;
  name: string;
  path: string;
  size: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export interface UploadResult {
  fileName: string;
  success: boolean;
  error?: string;
}

export interface UploadProgress {
  total: number;
  completed: number;
  current?: string;
}

export interface MatchingValue {
  field: string;
  value: any;
}

export interface DifferingValue {
  field: string;
  value1: any;
  value2: any;
}

export interface DuplicateComparison {
  is_duplicate: boolean;
  duplicate_percentage: number;
  total_fields_compared: number;
  matching_fields: number;
  matching_values: MatchingValue[];
  differing_values: DifferingValue[];
}

export interface DuplicateEntry {
  file1: string;
  file2: string;
  comparison: DuplicateComparison;
}

export interface ParsedResult {
  filename: string;
  data: any;
}

export interface ComparisonResult {
  total_files: number;
  duplicates_found: number;
  duplicates: DuplicateEntry[];
  parsed_results: ParsedResult[];
}

@Injectable({
  providedIn: 'root'
})
export class PdfUploadService {
  private http = inject(HttpClient);

  // Configure your backend URL here
  private readonly apiUrl = 'http://localhost:5000';

  // Number of concurrent uploads
  private readonly concurrency = 5;

  // Current session ID
  private sessionId: string | null = null;

  /**
   * Check if File System Access API is supported
   */
  isDirectoryPickerSupported(): boolean {
    return 'showDirectoryPicker' in window;
  }

  /**
   * Open native directory picker and scan for PDFs
   */
  async selectDirectory(): Promise<PdfFile[]> {
    const dirHandle = await (window as any).showDirectoryPicker();
    return this.scanDirectory(dirHandle, '');
  }

  /**
   * Recursively scan directory for PDF files
   */
  private async scanDirectory(dirHandle: FileSystemDirectoryHandle, path: string): Promise<PdfFile[]> {
    const pdfFiles: PdfFile[] = [];

    for await (const entry of (dirHandle as any).values()) {
      const entryPath = path ? `${path}/${entry.name}` : entry.name;

      if (entry.kind === 'file') {
        if (entry.name.toLowerCase().endsWith('.pdf')) {
          const file = await entry.getFile();
          pdfFiles.push({
            file,
            name: file.name,
            path: entryPath,
            size: file.size,
            status: 'pending'
          });
        }
      } else if (entry.kind === 'directory') {
        // Recursively scan subdirectories
        const subDirFiles = await this.scanDirectory(entry, entryPath);
        pdfFiles.push(...subDirFiles);
      }
    }

    return pdfFiles;
  }

  /**
   * Filter files to only include PDFs (fallback for browsers without directory picker)
   */
  filterPdfFiles(files: FileList): PdfFile[] {
    const pdfFiles: PdfFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        // webkitRelativePath contains the relative path from the selected folder
        const relativePath = (file as any).webkitRelativePath || file.name;
        pdfFiles.push({
          file,
          name: file.name,
          path: relativePath,
          size: file.size,
          status: 'pending'
        });
      }
    }

    return pdfFiles;
  }

  /**
   * Start a new comparison session
   */
  private startSession(): Observable<string> {
    return this.http.post<{ session_id: string }>(`${this.apiUrl}/session/start`, {}).pipe(
      map((response) => {
        this.sessionId = response.session_id;
        return response.session_id;
      })
    );
  }

  /**
   * Upload a single PDF file to the current session
   */
  private uploadSinglePdf(pdfFile: PdfFile): Observable<UploadResult> {
    if (!this.sessionId) {
      return of({
        fileName: pdfFile.name,
        success: false,
        error: 'No active session'
      });
    }

    const formData = new FormData();
    formData.append('file', pdfFile.file);

    return this.http.post<{ uploaded: boolean; filename: string; total_in_session: number }>(
      `${this.apiUrl}/session/${this.sessionId}/upload`,
      formData
    ).pipe(
      map(() => ({
        fileName: pdfFile.name,
        success: true
      })),
      catchError((error) => of({
        fileName: pdfFile.name,
        success: false,
        error: error.error?.error || error.message || 'Upload failed'
      }))
    );
  }

  /**
   * Finalize the session and get comparison results
   */
  finalizeSession(): Observable<ComparisonResult> {
    if (!this.sessionId) {
      return throwError(() => new Error('No active session'));
    }

    const sessionId = this.sessionId;
    this.sessionId = null; // Clear session after finalize

    return this.http.post<ComparisonResult>(
      `${this.apiUrl}/session/${sessionId}/finalize`,
      {}
    );
  }

  /**
   * Upload multiple PDFs with concurrency control
   * Returns an observable that emits progress updates
   */
  uploadPdfs(pdfFiles: PdfFile[]): Observable<{ result: UploadResult; progress: UploadProgress }> {
    const progressSubject = new Subject<{ result: UploadResult; progress: UploadProgress }>();
    let completed = 0;
    const total = pdfFiles.length;

    // Start session first, then upload all files
    this.startSession().pipe(
      mergeMap(() => from(pdfFiles)),
      mergeMap((pdfFile) => {
        pdfFile.status = 'uploading';
        return this.uploadSinglePdf(pdfFile).pipe(
          map((result) => {
            completed++;
            pdfFile.status = result.success ? 'success' : 'error';
            if (!result.success) {
              pdfFile.error = result.error;
            }
            return {
              result,
              progress: {
                total,
                completed,
                current: pdfFile.name
              }
            };
          })
        );
      }, this.concurrency)
    ).subscribe({
      next: (update) => progressSubject.next(update),
      complete: () => progressSubject.complete(),
      error: (err) => progressSubject.error(err)
    });

    return progressSubject.asObservable();
  }
}

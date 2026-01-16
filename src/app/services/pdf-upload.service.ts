import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, from, mergeMap, map, catchError, of } from 'rxjs';

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

@Injectable({
  providedIn: 'root'
})
export class PdfUploadService {
  private http = inject(HttpClient);

  // Configure your backend URL here
  private readonly apiUrl = 'http://localhost:8000/upload';

  // Number of concurrent uploads
  private readonly concurrency = 3;

  /**
   * Convert a File to base64 string
   */
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        // Remove the data URL prefix (e.g., "data:application/pdf;base64,")
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  }

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
   * Upload a single PDF file
   */
  private uploadSinglePdf(pdfFile: PdfFile): Observable<UploadResult> {
    return from(this.fileToBase64(pdfFile.file)).pipe(
      mergeMap((base64Content) => {
        const payload = {
          fileName: pdfFile.name,
          fileSize: pdfFile.size,
          content: base64Content
        };

        return this.http.post<{ success: boolean; message?: string }>(this.apiUrl, payload).pipe(
          map(() => ({
            fileName: pdfFile.name,
            success: true
          })),
          catchError((error) => of({
            fileName: pdfFile.name,
            success: false,
            error: error.message || 'Upload failed'
          }))
        );
      }),
      catchError((error) => of({
        fileName: pdfFile.name,
        success: false,
        error: error.message || 'Failed to read file'
      }))
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

    from(pdfFiles).pipe(
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

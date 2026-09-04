/**
 * File Upload Component Types
 *
 * Type definitions for a file upload component with drag & drop, progress tracking,
 * and validation following the Composable Architecture pattern.
 */

/**
 * Upload status for individual files
 */
export type UploadStatus = 'pending' | 'uploading' | 'success' | 'error';

/**
 * A single uploaded file with metadata
 */
export interface UploadedFile {
  /** Unique identifier for the file */
  id: string;
  /** The File object from the browser */
  file: File;
  /** Current upload status */
  status: UploadStatus;
  /** Upload progress (0-100) */
  progress: number;
  /** Error message if upload failed */
  error?: string;
  /** Preview URL for images (optional) */
  previewUrl?: string;
}

/**
 * Validation error types
 */
export type ValidationErrorType = 'max-size' | 'invalid-type' | 'max-files';

/**
 * Validation error for file upload
 */
export interface ValidationError {
  type: ValidationErrorType;
  message: string;
  fileName?: string;
}

/**
 * State for the FileUpload component
 */
export interface FileUploadState {
  /** List of uploaded files */
  files: UploadedFile[];
  /** Whether drag is currently active over the drop zone */
  isDragActive: boolean;
  /** Validation errors */
  errors: ValidationError[];
  /** Whether any file is currently uploading */
  isUploading: boolean;
}

/**
 * Actions for the FileUpload reducer
 */
export type FileUploadAction =
  | { type: 'filesSelected'; files: File[] }
  | { type: 'filesValidated'; validFiles: UploadedFile[]; errors: ValidationError[] }
  | { type: 'fileRemoved'; fileId: string }
  | { type: 'uploadStarted'; fileId: string }
  | { type: 'uploadProgress'; fileId: string; progress: number }
  | { type: 'uploadCompleted'; fileId: string }
  | { type: 'uploadFailed'; fileId: string; error: string }
  | { type: 'dragEntered' }
  | { type: 'dragLeft' }
  | { type: 'allFilesCleared' }
  | { type: 'errorDismissed'; index: number };

/**
 * Configuration for file validation
 */
export interface FileValidationConfig {
  /** Maximum file size in bytes (default: 5MB) */
  maxSize?: number | undefined;
  /** Allowed file types (MIME types or extensions like '.jpg') */
  acceptedTypes?: string[] | undefined;
  /** Maximum number of files (default: unlimited) */
  maxFiles?: number | undefined;
}

/**
 * Dependencies for the FileUpload reducer
 */
export interface FileUploadDependencies {
  /** Callback when files change */
  onFilesChange?: ((files: UploadedFile[]) => void) | undefined;
  /** Callback to handle file upload (returns promise) */
  /**
   * Handle an upload, reporting progress.
   *
   * `onProgress` is a widening, not a breaking change: an existing
   * `(file) => Promise<void>` stays assignable under TypeScript's
   * fewer-parameters rule. Without it there was no channel to report through,
   * so `uploadProgress` had no dispatcher and the bar sat at 0% throughout.
   */
  onUpload?:
    | ((file: File, onProgress: (percent: number) => void) => Promise<void>)
    | undefined;
  /** File validation configuration */
  validation?: FileValidationConfig | undefined;
}

/**
 * Props for the FileUpload component
 */
export interface FileUploadProps {
  /**
   * Which heading element to render.
   *
   * The level belongs to the page, not to the component: put this under an
   * `<h2>` and a fixed `<h3>` jumps the outline, which no consumer can fix from
   * the outside. Defaults to the level it has always rendered.
   */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6 | undefined;
  /** Accept attribute for file input (e.g., "image/*" or ".jpg,.png") */
  accept?: string | undefined;
  /** Whether to allow multiple files */
  multiple?: boolean | undefined;
  /** Whether to show file previews for images */
  showPreviews?: boolean | undefined;
  /** Maximum file size in bytes */
  maxSize?: number | undefined;
  /** Maximum number of files */
  maxFiles?: number | undefined;
  /** Custom text for the drop zone */
  dropzoneText?: string | undefined;
  /** Callback when files are selected */
  onFilesChange?: ((files: UploadedFile[]) => void) | undefined;
  /**
   * Callback to handle file upload.
   *
   * `onProgress` is the channel the component reports through: the reducer
   * passes it on every call, and each invocation dispatches `uploadProgress`.
   * A handler that ignores it is fine — a one-parameter function is assignable
   * here — but one that wants it must be able to declare it, which is what was
   * broken while the component kept its own one-parameter copy of this type.
   */
  onUpload?:
    | ((file: File, onProgress: (percent: number) => void) => Promise<void>)
    | undefined;
  /** Custom class for container */
  class?: string | undefined;
  /** Whether the component is disabled */
  disabled?: boolean | undefined;
}

/**
 * Create the initial state for file upload
 */
export function createInitialFileUploadState(): FileUploadState {
  return {
    files: [],
    isDragActive: false,
    errors: [],
    isUploading: false
  };
}

/**
 * Helper to generate unique file ID
 */
export function generateFileId(): string {
  return `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Helper to format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

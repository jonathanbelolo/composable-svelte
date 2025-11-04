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
export type FileUploadAction = {
    type: 'filesSelected';
    files: File[];
} | {
    type: 'filesValidated';
    validFiles: UploadedFile[];
    errors: ValidationError[];
} | {
    type: 'fileRemoved';
    fileId: string;
} | {
    type: 'uploadStarted';
    fileId: string;
} | {
    type: 'uploadProgress';
    fileId: string;
    progress: number;
} | {
    type: 'uploadCompleted';
    fileId: string;
} | {
    type: 'uploadFailed';
    fileId: string;
    error: string;
} | {
    type: 'dragEntered';
} | {
    type: 'dragLeft';
} | {
    type: 'allFilesCleared';
} | {
    type: 'errorDismissed';
    index: number;
};
/**
 * Configuration for file validation
 */
export interface FileValidationConfig {
    /** Maximum file size in bytes (default: 5MB) */
    maxSize?: number;
    /** Allowed file types (MIME types or extensions like '.jpg') */
    acceptedTypes?: string[];
    /** Maximum number of files (default: unlimited) */
    maxFiles?: number;
}
/**
 * Dependencies for the FileUpload reducer
 */
export interface FileUploadDependencies {
    /** Callback when files change */
    onFilesChange?: (files: UploadedFile[]) => void;
    /** Callback to handle file upload (returns promise) */
    onUpload?: (file: File) => Promise<void>;
    /** File validation configuration */
    validation?: FileValidationConfig;
}
/**
 * Props for the FileUpload component
 */
export interface FileUploadProps {
    /** Accept attribute for file input (e.g., "image/*" or ".jpg,.png") */
    accept?: string;
    /** Whether to allow multiple files */
    multiple?: boolean;
    /** Whether to show file previews for images */
    showPreviews?: boolean;
    /** Maximum file size in bytes */
    maxSize?: number;
    /** Maximum number of files */
    maxFiles?: number;
    /** Custom text for the drop zone */
    dropzoneText?: string;
    /** Callback when files are selected */
    onFilesChange?: (files: UploadedFile[]) => void;
    /** Callback to handle file upload */
    onUpload?: (file: File) => Promise<void>;
    /** Custom class for container */
    class?: string;
    /** Whether the component is disabled */
    disabled?: boolean;
}
/**
 * Create the initial state for file upload
 */
export declare function createInitialFileUploadState(): FileUploadState;
/**
 * Helper to generate unique file ID
 */
export declare function generateFileId(): string;
/**
 * Helper to format file size
 */
export declare function formatFileSize(bytes: number): string;
//# sourceMappingURL=file-upload.types.d.ts.map
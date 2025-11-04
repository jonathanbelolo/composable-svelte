/**
 * File Upload Component Types
 *
 * Type definitions for a file upload component with drag & drop, progress tracking,
 * and validation following the Composable Architecture pattern.
 */
/**
 * Create the initial state for file upload
 */
export function createInitialFileUploadState() {
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
export function generateFileId() {
    return `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
/**
 * Helper to format file size
 */
export function formatFileSize(bytes) {
    if (bytes === 0)
        return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

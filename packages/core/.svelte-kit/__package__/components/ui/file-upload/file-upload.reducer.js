/**
 * File Upload Reducer
 *
 * Pure business logic for file upload with drag & drop, validation, and progress tracking
 * following the Composable Architecture pattern.
 */
import { Effect } from '../../../effect.js';
import { generateFileId } from './file-upload.types.js';
/**
 * Main reducer for file upload component
 */
export function fileUploadReducer(state, action, deps) {
    switch (action.type) {
        case 'filesSelected': {
            const { files } = action;
            // Validate files and dispatch validation action
            const effect = Effect.run(async (dispatch) => {
                const validation = deps?.validation || {};
                const { validFiles, errors } = validateFiles(files, validation, state.files.length);
                dispatch({ type: 'filesValidated', validFiles, errors });
            });
            return [state, effect];
        }
        case 'filesValidated': {
            const { validFiles, errors } = action;
            // Add valid files to state
            const newFiles = [...state.files, ...validFiles];
            // Trigger onFilesChange callback
            const effects = [];
            if (deps?.onFilesChange) {
                effects.push(Effect.run(async () => {
                    deps.onFilesChange(newFiles);
                }));
            }
            // Start upload for each valid file if onUpload is provided
            if (deps?.onUpload && validFiles.length > 0) {
                validFiles.forEach((uploadedFile) => {
                    effects.push(Effect.run(async (dispatch) => {
                        dispatch({ type: 'uploadStarted', fileId: uploadedFile.id });
                        try {
                            // Call the upload function
                            await deps.onUpload(uploadedFile.file);
                            dispatch({ type: 'uploadCompleted', fileId: uploadedFile.id });
                        }
                        catch (error) {
                            const errorMessage = error instanceof Error ? error.message : 'Upload failed';
                            dispatch({ type: 'uploadFailed', fileId: uploadedFile.id, error: errorMessage });
                        }
                    }));
                });
            }
            return [
                {
                    ...state,
                    files: newFiles,
                    errors: [...state.errors, ...errors],
                    isDragActive: false
                },
                effects.length > 0 ? Effect.batch(...effects) : Effect.none()
            ];
        }
        case 'fileRemoved': {
            const { fileId } = action;
            const newFiles = state.files.filter((f) => f.id !== fileId);
            // Trigger onFilesChange callback
            const effect = deps?.onFilesChange
                ? Effect.run(async () => {
                    deps.onFilesChange(newFiles);
                })
                : Effect.none();
            return [
                {
                    ...state,
                    files: newFiles,
                    isUploading: newFiles.some((f) => f.status === 'uploading')
                },
                effect
            ];
        }
        case 'uploadStarted': {
            const { fileId } = action;
            const newFiles = state.files.map((f) => f.id === fileId ? { ...f, status: 'uploading', progress: 0 } : f);
            return [
                {
                    ...state,
                    files: newFiles,
                    isUploading: true
                },
                Effect.none()
            ];
        }
        case 'uploadProgress': {
            const { fileId, progress } = action;
            const newFiles = state.files.map((f) => f.id === fileId ? { ...f, progress: Math.min(100, Math.max(0, progress)) } : f);
            return [{ ...state, files: newFiles }, Effect.none()];
        }
        case 'uploadCompleted': {
            const { fileId } = action;
            const newFiles = state.files.map((f) => f.id === fileId ? { ...f, status: 'success', progress: 100 } : f);
            return [
                {
                    ...state,
                    files: newFiles,
                    isUploading: newFiles.some((f) => f.status === 'uploading')
                },
                Effect.none()
            ];
        }
        case 'uploadFailed': {
            const { fileId, error } = action;
            const newFiles = state.files.map((f) => f.id === fileId ? { ...f, status: 'error', error } : f);
            return [
                {
                    ...state,
                    files: newFiles,
                    isUploading: newFiles.some((f) => f.status === 'uploading')
                },
                Effect.none()
            ];
        }
        case 'dragEntered': {
            return [{ ...state, isDragActive: true }, Effect.none()];
        }
        case 'dragLeft': {
            return [{ ...state, isDragActive: false }, Effect.none()];
        }
        case 'allFilesCleared': {
            // Trigger onFilesChange callback
            const effect = deps?.onFilesChange
                ? Effect.run(async () => {
                    deps.onFilesChange([]);
                })
                : Effect.none();
            return [
                {
                    ...state,
                    files: [],
                    errors: [],
                    isUploading: false
                },
                effect
            ];
        }
        case 'errorDismissed': {
            const { index } = action;
            const newErrors = state.errors.filter((_, i) => i !== index);
            return [{ ...state, errors: newErrors }, Effect.none()];
        }
        default: {
            const _exhaustive = action;
            return [state, Effect.none()];
        }
    }
}
/**
 * Validate files against configuration
 */
function validateFiles(files, config, currentFileCount) {
    const validFiles = [];
    const errors = [];
    const maxSize = config.maxSize || 5 * 1024 * 1024; // Default 5MB
    const acceptedTypes = config.acceptedTypes || [];
    const maxFiles = config.maxFiles || Infinity;
    // Check if adding these files would exceed maxFiles
    if (currentFileCount + files.length > maxFiles) {
        errors.push({
            type: 'max-files',
            message: `Cannot upload more than ${maxFiles} file${maxFiles === 1 ? '' : 's'}`
        });
        // Only process files up to the limit
        files = files.slice(0, Math.max(0, maxFiles - currentFileCount));
    }
    files.forEach((file) => {
        // Check file size
        if (file.size > maxSize) {
            errors.push({
                type: 'max-size',
                message: `File "${file.name}" exceeds maximum size of ${formatBytes(maxSize)}`,
                fileName: file.name
            });
            return;
        }
        // Check file type if restrictions exist
        if (acceptedTypes.length > 0) {
            const isValidType = acceptedTypes.some((type) => {
                // Handle MIME type (e.g., "image/*", "image/png")
                if (type.includes('/')) {
                    if (type.endsWith('/*')) {
                        const category = type.split('/')[0];
                        return file.type.startsWith(`${category}/`);
                    }
                    return file.type === type;
                }
                // Handle extension (e.g., ".jpg", ".png")
                if (type.startsWith('.')) {
                    return file.name.toLowerCase().endsWith(type.toLowerCase());
                }
                return false;
            });
            if (!isValidType) {
                errors.push({
                    type: 'invalid-type',
                    message: `File "${file.name}" is not an accepted file type`,
                    fileName: file.name
                });
                return;
            }
        }
        // File is valid - create UploadedFile object
        const uploadedFile = {
            id: generateFileId(),
            file,
            status: 'pending',
            progress: 0
        };
        // Generate preview URL for images (only in browser environment)
        if (file.type.startsWith('image/') && typeof URL !== 'undefined' && URL.createObjectURL) {
            try {
                uploadedFile.previewUrl = URL.createObjectURL(file);
            }
            catch (e) {
                // Silently fail in test environments
            }
        }
        validFiles.push(uploadedFile);
    });
    return { validFiles, errors };
}
/**
 * Helper to format bytes
 */
function formatBytes(bytes) {
    if (bytes === 0)
        return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

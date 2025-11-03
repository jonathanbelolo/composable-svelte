/**
 * File Upload Reducer
 *
 * Pure business logic for file upload with drag & drop, validation, and progress tracking
 * following the Composable Architecture pattern.
 */

import { Effect } from '../../../effect.js';
import type { Effect as EffectType } from '../../../types.js';
import type {
  FileUploadState,
  FileUploadAction,
  FileUploadDependencies,
  UploadedFile,
  ValidationError,
  FileValidationConfig
} from './file-upload.types.js';
import { generateFileId } from './file-upload.types.js';

/**
 * Main reducer for file upload component
 */
export function fileUploadReducer(
  state: FileUploadState,
  action: FileUploadAction,
  deps?: FileUploadDependencies
): [FileUploadState, EffectType<FileUploadAction>] {
  switch (action.type) {
    case 'filesSelected': {
      const { files } = action;

      // Validate files and dispatch validation action
      const effect = Effect.run<FileUploadAction>(async (dispatch) => {
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
      const effects: EffectType<FileUploadAction>[] = [];

      if (deps?.onFilesChange) {
        effects.push(
          Effect.run<FileUploadAction>(async () => {
            deps.onFilesChange!(newFiles);
          })
        );
      }

      // Start upload for each valid file if onUpload is provided
      if (deps?.onUpload && validFiles.length > 0) {
        validFiles.forEach((uploadedFile) => {
          effects.push(
            Effect.run<FileUploadAction>(async (dispatch) => {
              dispatch({ type: 'uploadStarted', fileId: uploadedFile.id });

              try {
                // Call the upload function
                await deps.onUpload!(uploadedFile.file);
                dispatch({ type: 'uploadCompleted', fileId: uploadedFile.id });
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Upload failed';
                dispatch({ type: 'uploadFailed', fileId: uploadedFile.id, error: errorMessage });
              }
            })
          );
        });
      }

      return [
        {
          ...state,
          files: newFiles,
          errors: [...state.errors, ...errors],
          isDragActive: false
        },
        effects.length > 0 ? Effect.batch(...effects) : Effect.none<FileUploadAction>()
      ];
    }

    case 'fileRemoved': {
      const { fileId } = action;

      const newFiles = state.files.filter((f) => f.id !== fileId);

      // Trigger onFilesChange callback
      const effect = deps?.onFilesChange
        ? Effect.run<FileUploadAction>(async () => {
            deps.onFilesChange!(newFiles);
          })
        : Effect.none<FileUploadAction>();

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

      const newFiles = state.files.map((f) =>
        f.id === fileId ? { ...f, status: 'uploading' as const, progress: 0 } : f
      );

      return [
        {
          ...state,
          files: newFiles,
          isUploading: true
        },
        Effect.none<FileUploadAction>()
      ];
    }

    case 'uploadProgress': {
      const { fileId, progress } = action;

      const newFiles = state.files.map((f) =>
        f.id === fileId ? { ...f, progress: Math.min(100, Math.max(0, progress)) } : f
      );

      return [{ ...state, files: newFiles }, Effect.none<FileUploadAction>()];
    }

    case 'uploadCompleted': {
      const { fileId } = action;

      const newFiles = state.files.map((f) =>
        f.id === fileId ? { ...f, status: 'success' as const, progress: 100 } : f
      );

      return [
        {
          ...state,
          files: newFiles,
          isUploading: newFiles.some((f) => f.status === 'uploading')
        },
        Effect.none<FileUploadAction>()
      ];
    }

    case 'uploadFailed': {
      const { fileId, error } = action;

      const newFiles = state.files.map((f) =>
        f.id === fileId ? { ...f, status: 'error' as const, error } : f
      );

      return [
        {
          ...state,
          files: newFiles,
          isUploading: newFiles.some((f) => f.status === 'uploading')
        },
        Effect.none<FileUploadAction>()
      ];
    }

    case 'dragEntered': {
      return [{ ...state, isDragActive: true }, Effect.none<FileUploadAction>()];
    }

    case 'dragLeft': {
      return [{ ...state, isDragActive: false }, Effect.none<FileUploadAction>()];
    }

    case 'allFilesCleared': {
      // Trigger onFilesChange callback
      const effect = deps?.onFilesChange
        ? Effect.run<FileUploadAction>(async () => {
            deps.onFilesChange!([]);
          })
        : Effect.none<FileUploadAction>();

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

      return [{ ...state, errors: newErrors }, Effect.none<FileUploadAction>()];
    }

    default: {
      const _exhaustive: never = action;
      return [state, Effect.none<FileUploadAction>()];
    }
  }
}

/**
 * Validate files against configuration
 */
function validateFiles(
  files: File[],
  config: FileValidationConfig,
  currentFileCount: number
): { validFiles: UploadedFile[]; errors: ValidationError[] } {
  const validFiles: UploadedFile[] = [];
  const errors: ValidationError[] = [];

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
    const uploadedFile: UploadedFile = {
      id: generateFileId(),
      file,
      status: 'pending',
      progress: 0
    };

    // Generate preview URL for images (only in browser environment)
    if (file.type.startsWith('image/') && typeof URL !== 'undefined' && URL.createObjectURL) {
      try {
        uploadedFile.previewUrl = URL.createObjectURL(file);
      } catch (e) {
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
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

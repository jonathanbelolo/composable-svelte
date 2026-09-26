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
import { generateFileId, formatFileSize } from './file-upload.types.js';

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
            deps.onFilesChange!(newFiles.map(file => ({ ...file })));
          })
        );
      }

      // A preview is a store-owned resource, acquired only after its subscription enrolls.
      for (const file of validFiles) {
        if (deps?.previews === false || !file.file.type.startsWith('image/')) continue;
        effects.push(Effect.subscription<FileUploadAction>(`file-preview:${file.id}`, dispatch => {
          let url: string | undefined;
          try { url = URL.createObjectURL(file.file); } catch { /* Preview is optional. */ }
          if (!url) return () => {};
          const previewUrl = url;
          try { dispatch({ type: 'previewReady', fileId: file.id, previewUrl }); }
          catch (error) { URL.revokeObjectURL(previewUrl); throw error; }
          return () => URL.revokeObjectURL(previewUrl);
        }));
      }

      // Start upload for each valid file if onUpload is provided
      if (deps?.onUpload && validFiles.length > 0) {
        validFiles.forEach((uploadedFile) => {
          effects.push(
            Effect.cancellable<FileUploadAction>(`file-upload:${uploadedFile.id}`, async (dispatch, signal) => {
              const upload = deps?.onUpload;
              if (!upload || signal?.aborted) return;
              dispatch({ type: 'uploadStarted', fileId: uploadedFile.id });

              if (signal?.aborted) return;
              try {
                // Call the upload function, giving it a progress channel.
                await upload(uploadedFile.file, (percent) => {
                  dispatch({ type: 'uploadProgress', fileId: uploadedFile.id, progress: percent });
                }, signal);
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

    case 'previewReady': {
      if (!state.files.some(file => file.id === action.fileId)) {
        return [state, Effect.cancel(`file-preview:${action.fileId}`)];
      }
      const files = state.files.map(file => file.id === action.fileId ? { ...file, previewUrl: action.previewUrl } : file);
      return [{ ...state, files }, deps?.onFilesChange
        ? Effect.run(async () => { deps.onFilesChange!(files.map(file => ({ ...file }))); }) : Effect.none()];
    }

    case 'fileRemoved': {
      const { fileId } = action;

      if (!state.files.some(file => file.id === fileId)) return [state, Effect.none()];
      const newFiles = state.files.filter((f) => f.id !== fileId);

      // Trigger onFilesChange callback
      const removed = state.files.filter((file) => file.id === fileId);
      const effect = Effect.run<FileUploadAction>(async () => {
        deps?.onFilesChange?.(newFiles.map(file => ({ ...file })));
      });

      return [
        {
          ...state,
          files: newFiles,
          isUploading: newFiles.some((f) => f.status === 'uploading')
        },
        Effect.batch(...removed.flatMap(file => [Effect.cancel<FileUploadAction>(`file-preview:${file.id}`), Effect.cancel<FileUploadAction>(`file-upload:${file.id}`)]), effect)
      ];
    }

    case 'uploadStarted': {
      const { fileId } = action;
      if (!state.files.some(file => file.id === fileId)) return [state, Effect.cancel(`file-upload:${fileId}`)];

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

      // Only while uploading. A callback arriving after `uploadCompleted` would
      // otherwise rewind a finished bar from 100% back to mid-upload — and a
      // consumer's progress reporting is not guaranteed to stop the instant its
      // promise resolves.
      const target = state.files.find((f) => f.id === fileId);
      if (!target || target.status !== 'uploading') {
        return [state, Effect.none<FileUploadAction>()];
      }

      const clamped = Math.min(100, Math.max(0, progress));
      if (target.progress === clamped) {
        return [state, Effect.none<FileUploadAction>()];
      }

      const newFiles = state.files.map((f) => (f.id === fileId ? { ...f, progress: clamped } : f));

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
      if (state.files.length === 0 && state.errors.length === 0) return [state, Effect.none()];
      // Trigger onFilesChange callback
      const effect = Effect.run<FileUploadAction>(async () => {
        if (state.files.length) deps?.onFilesChange?.([]);
      });

      return [
        {
          ...state,
          files: [],
          errors: [],
          isUploading: false
        },
        Effect.batch(...state.files.flatMap(file => [Effect.cancel<FileUploadAction>(`file-preview:${file.id}`), Effect.cancel<FileUploadAction>(`file-upload:${file.id}`)]), effect)
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
  const maxFiles = config.maxFiles ?? Infinity;

  files.forEach((file) => {
    // Check file size
    if (file.size > maxSize) {
      errors.push({
        type: 'max-size',
        message: `File "${file.name}" exceeds maximum size of ${formatFileSize(maxSize)}`,
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

    validFiles.push(uploadedFile);
  });

  const available = Math.max(0, maxFiles - currentFileCount);
  if (validFiles.length > available) {
    validFiles.splice(available);
    errors.push({ type: 'max-files', message: `Cannot upload more than ${maxFiles} file${maxFiles === 1 ? '' : 's'}` });
  }
  return { validFiles, errors };
}


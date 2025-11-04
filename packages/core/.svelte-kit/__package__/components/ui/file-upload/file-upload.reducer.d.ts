/**
 * File Upload Reducer
 *
 * Pure business logic for file upload with drag & drop, validation, and progress tracking
 * following the Composable Architecture pattern.
 */
import type { Effect as EffectType } from '../../../types.js';
import type { FileUploadState, FileUploadAction, FileUploadDependencies } from './file-upload.types.js';
/**
 * Main reducer for file upload component
 */
export declare function fileUploadReducer(state: FileUploadState, action: FileUploadAction, deps?: FileUploadDependencies): [FileUploadState, EffectType<FileUploadAction>];
//# sourceMappingURL=file-upload.reducer.d.ts.map
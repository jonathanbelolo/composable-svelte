import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestStore } from '../src/test/test-store.js';
import { fileUploadReducer } from '../src/components/ui/file-upload/file-upload.reducer.js';
import {
  createInitialFileUploadState,
  generateFileId,
  formatFileSize,
  type FileUploadAction,
  type UploadedFile
} from '../src/components/ui/file-upload/file-upload.types.js';

describe('File Upload Component', () => {
  // Helper to create mock File objects with proper size
  function createMockFile(
    name: string,
    size: number,
    type: string = 'image/png'
  ): File {
    // Create content of the specified size
    const content = new Array(size).fill('a').join('');
    const file = new File([content], name, { type }) as File;
    // Override size property to ensure it matches (Node.js File constructor calculates from content)
    Object.defineProperty(file, 'size', { value: size, writable: false });
    return file;
  }

  describe('File Selection and Validation', () => {
    it('should add valid files to state', async () => {
      const store = new TestStore({
        initialState: createInitialFileUploadState(),
        reducer: fileUploadReducer,
        dependencies: {
          validation: {
            maxSize: 5 * 1024 * 1024,
            acceptedTypes: ['image/*']
          }
        }
      });

      const files = [createMockFile('test1.png', 1024), createMockFile('test2.png', 2048)];

      await store.send({ type: 'filesSelected', files });

      await store.receive({ type: 'filesValidated' }, (state) => {
        expect(state.files.length).toBe(2);
        expect(state.files[0].file.name).toBe('test1.png');
        expect(state.files[1].file.name).toBe('test2.png');
        expect(state.errors.length).toBe(0);
      });
    });

    it('should reject files exceeding max size', async () => {
      const store = new TestStore({
        initialState: createInitialFileUploadState(),
        reducer: fileUploadReducer,
        dependencies: {
          validation: {
            maxSize: 1024, // 1KB
            acceptedTypes: []
          }
        }
      });

      const files = [
        createMockFile('small.png', 512),
        createMockFile('large.png', 2048) // Exceeds 1KB
      ];

      await store.send({ type: 'filesSelected', files });

      await store.receive({ type: 'filesValidated' }, (state) => {
        expect(state.files.length).toBe(1);
        expect(state.files[0].file.name).toBe('small.png');
        expect(state.errors.length).toBe(1);
        expect(state.errors[0].type).toBe('max-size');
        expect(state.errors[0].fileName).toBe('large.png');
      });
    });

    it('should reject files with invalid types', async () => {
      const store = new TestStore({
        initialState: createInitialFileUploadState(),
        reducer: fileUploadReducer,
        dependencies: {
          validation: {
            acceptedTypes: ['image/*']
          }
        }
      });

      const files = [
        createMockFile('image.png', 1024, 'image/png'),
        createMockFile('document.pdf', 1024, 'application/pdf')
      ];

      await store.send({ type: 'filesSelected', files });

      await store.receive({ type: 'filesValidated' }, (state) => {
        expect(state.files.length).toBe(1);
        expect(state.files[0].file.name).toBe('image.png');
        expect(state.errors.length).toBe(1);
        expect(state.errors[0].type).toBe('invalid-type');
        expect(state.errors[0].fileName).toBe('document.pdf');
      });
    });

    it('should reject files exceeding max files limit', async () => {
      const store = new TestStore({
        initialState: createInitialFileUploadState(),
        reducer: fileUploadReducer,
        dependencies: {
          validation: {
            maxFiles: 2
          }
        }
      });

      const files = [
        createMockFile('file1.png', 1024),
        createMockFile('file2.png', 1024),
        createMockFile('file3.png', 1024)
      ];

      await store.send({ type: 'filesSelected', files });

      await store.receive({ type: 'filesValidated' }, (state) => {
        expect(state.files.length).toBe(2);
        expect(state.errors.length).toBe(1);
        expect(state.errors[0].type).toBe('max-files');
      });
    });

    it('should validate file extensions', async () => {
      const store = new TestStore({
        initialState: createInitialFileUploadState(),
        reducer: fileUploadReducer,
        dependencies: {
          validation: {
            acceptedTypes: ['.jpg', '.png']
          }
        }
      });

      const files = [
        createMockFile('image.jpg', 1024),
        createMockFile('image.png', 1024),
        createMockFile('image.gif', 1024)
      ];

      await store.send({ type: 'filesSelected', files });

      await store.receive({ type: 'filesValidated' }, (state) => {
        expect(state.files.length).toBe(2);
        expect(state.errors.length).toBe(1);
        expect(state.errors[0].fileName).toBe('image.gif');
      });
    });

    it('should enforce max files limit when adding to existing files', async () => {
      const existingFile: UploadedFile = {
        id: generateFileId(),
        file: createMockFile('existing.png', 1024),
        status: 'success',
        progress: 100
      };

      const store = new TestStore({
        initialState: {
          ...createInitialFileUploadState(),
          files: [existingFile]
        },
        reducer: fileUploadReducer,
        dependencies: {
          validation: {
            maxFiles: 2
          }
        }
      });

      const files = [
        createMockFile('new1.png', 1024),
        createMockFile('new2.png', 1024)
      ];

      await store.send({ type: 'filesSelected', files });

      await store.receive({ type: 'filesValidated' }, (state) => {
        expect(state.files.length).toBe(2);
        expect(state.errors.length).toBe(1);
        expect(state.errors[0].type).toBe('max-files');
      });
    });
  });

  describe('File Removal', () => {
    it('should remove a file by ID', async () => {
      const file1: UploadedFile = {
        id: 'file-1',
        file: createMockFile('file1.png', 1024),
        status: 'pending',
        progress: 0
      };
      const file2: UploadedFile = {
        id: 'file-2',
        file: createMockFile('file2.png', 2048),
        status: 'pending',
        progress: 0
      };

      const store = new TestStore({
        initialState: {
          ...createInitialFileUploadState(),
          files: [file1, file2]
        },
        reducer: fileUploadReducer
      });

      await store.send({ type: 'fileRemoved', fileId: 'file-1' }, (state) => {
        expect(state.files.length).toBe(1);
        expect(state.files[0].id).toBe('file-2');
      });
    });

    it('should update isUploading when removing uploading file', async () => {
      const uploadingFile: UploadedFile = {
        id: 'file-1',
        file: createMockFile('file.png', 1024),
        status: 'uploading',
        progress: 50
      };

      const store = new TestStore({
        initialState: {
          ...createInitialFileUploadState(),
          files: [uploadingFile],
          isUploading: true
        },
        reducer: fileUploadReducer
      });

      await store.send({ type: 'fileRemoved', fileId: 'file-1' }, (state) => {
        expect(state.files.length).toBe(0);
        expect(state.isUploading).toBe(false);
      });
    });

    it('should call onFilesChange when file is removed', async () => {
      const onFilesChange = vi.fn();
      const file: UploadedFile = {
        id: 'file-1',
        file: createMockFile('file.png', 1024),
        status: 'pending',
        progress: 0
      };

      const store = new TestStore({
        initialState: {
          ...createInitialFileUploadState(),
          files: [file]
        },
        reducer: fileUploadReducer,
        dependencies: { onFilesChange }
      });

      await store.send({ type: 'fileRemoved', fileId: 'file-1' });

      expect(onFilesChange).toHaveBeenCalledWith([]);
    });
  });

  describe('Upload Lifecycle', () => {
    it('should start upload and update status', async () => {
      const file: UploadedFile = {
        id: 'file-1',
        file: createMockFile('file.png', 1024),
        status: 'pending',
        progress: 0
      };

      const store = new TestStore({
        initialState: {
          ...createInitialFileUploadState(),
          files: [file]
        },
        reducer: fileUploadReducer
      });

      await store.send({ type: 'uploadStarted', fileId: 'file-1' }, (state) => {
        expect(state.files[0].status).toBe('uploading');
        expect(state.files[0].progress).toBe(0);
        expect(state.isUploading).toBe(true);
      });
    });

    it('should update upload progress', async () => {
      const file: UploadedFile = {
        id: 'file-1',
        file: createMockFile('file.png', 1024),
        status: 'uploading',
        progress: 0
      };

      const store = new TestStore({
        initialState: {
          ...createInitialFileUploadState(),
          files: [file],
          isUploading: true
        },
        reducer: fileUploadReducer
      });

      await store.send({ type: 'uploadProgress', fileId: 'file-1', progress: 50 }, (state) => {
        expect(state.files[0].progress).toBe(50);
      });

      await store.send({ type: 'uploadProgress', fileId: 'file-1', progress: 100 }, (state) => {
        expect(state.files[0].progress).toBe(100);
      });
    });

    it('should clamp progress to 0-100 range', async () => {
      const file: UploadedFile = {
        id: 'file-1',
        file: createMockFile('file.png', 1024),
        status: 'uploading',
        progress: 0
      };

      const store = new TestStore({
        initialState: {
          ...createInitialFileUploadState(),
          files: [file]
        },
        reducer: fileUploadReducer
      });

      await store.send({ type: 'uploadProgress', fileId: 'file-1', progress: -10 }, (state) => {
        expect(state.files[0].progress).toBe(0);
      });

      await store.send({ type: 'uploadProgress', fileId: 'file-1', progress: 150 }, (state) => {
        expect(state.files[0].progress).toBe(100);
      });
    });

    it('should mark upload as completed', async () => {
      const file: UploadedFile = {
        id: 'file-1',
        file: createMockFile('file.png', 1024),
        status: 'uploading',
        progress: 50
      };

      const store = new TestStore({
        initialState: {
          ...createInitialFileUploadState(),
          files: [file],
          isUploading: true
        },
        reducer: fileUploadReducer
      });

      await store.send({ type: 'uploadCompleted', fileId: 'file-1' }, (state) => {
        expect(state.files[0].status).toBe('success');
        expect(state.files[0].progress).toBe(100);
        expect(state.isUploading).toBe(false);
      });
    });

    it('should mark upload as failed with error message', async () => {
      const file: UploadedFile = {
        id: 'file-1',
        file: createMockFile('file.png', 1024),
        status: 'uploading',
        progress: 50
      };

      const store = new TestStore({
        initialState: {
          ...createInitialFileUploadState(),
          files: [file],
          isUploading: true
        },
        reducer: fileUploadReducer
      });

      await store.send(
        { type: 'uploadFailed', fileId: 'file-1', error: 'Network error' },
        (state) => {
          expect(state.files[0].status).toBe('error');
          expect(state.files[0].error).toBe('Network error');
          expect(state.isUploading).toBe(false);
        }
      );
    });

    it('should keep isUploading true when other files are still uploading', async () => {
      const file1: UploadedFile = {
        id: 'file-1',
        file: createMockFile('file1.png', 1024),
        status: 'uploading',
        progress: 50
      };
      const file2: UploadedFile = {
        id: 'file-2',
        file: createMockFile('file2.png', 2048),
        status: 'uploading',
        progress: 30
      };

      const store = new TestStore({
        initialState: {
          ...createInitialFileUploadState(),
          files: [file1, file2],
          isUploading: true
        },
        reducer: fileUploadReducer
      });

      await store.send({ type: 'uploadCompleted', fileId: 'file-1' }, (state) => {
        expect(state.isUploading).toBe(true); // file-2 is still uploading
      });

      await store.send({ type: 'uploadCompleted', fileId: 'file-2' }, (state) => {
        expect(state.isUploading).toBe(false); // All uploads complete
      });
    });
  });

  describe('Drag and Drop', () => {
    it('should activate drag state', async () => {
      const store = new TestStore({
        initialState: createInitialFileUploadState(),
        reducer: fileUploadReducer
      });

      await store.send({ type: 'dragEntered' }, (state) => {
        expect(state.isDragActive).toBe(true);
      });
    });

    it('should deactivate drag state', async () => {
      const store = new TestStore({
        initialState: {
          ...createInitialFileUploadState(),
          isDragActive: true
        },
        reducer: fileUploadReducer
      });

      await store.send({ type: 'dragLeft' }, (state) => {
        expect(state.isDragActive).toBe(false);
      });
    });

    it('should clear drag state after file selection', async () => {
      const store = new TestStore({
        initialState: {
          ...createInitialFileUploadState(),
          isDragActive: true
        },
        reducer: fileUploadReducer
      });

      const files = [createMockFile('file.png', 1024)];

      await store.send({ type: 'filesSelected', files });

      await store.receive({ type: 'filesValidated' }, (state) => {
        expect(state.isDragActive).toBe(false);
      });
    });
  });

  describe('Clear All Files', () => {
    it('should clear all files', async () => {
      const file1: UploadedFile = {
        id: 'file-1',
        file: createMockFile('file1.png', 1024),
        status: 'success',
        progress: 100
      };
      const file2: UploadedFile = {
        id: 'file-2',
        file: createMockFile('file2.png', 2048),
        status: 'success',
        progress: 100
      };

      const store = new TestStore({
        initialState: {
          ...createInitialFileUploadState(),
          files: [file1, file2]
        },
        reducer: fileUploadReducer
      });

      await store.send({ type: 'allFilesCleared' }, (state) => {
        expect(state.files.length).toBe(0);
        expect(state.errors.length).toBe(0);
        expect(state.isUploading).toBe(false);
      });
    });

    it('should call onFilesChange when clearing all files', async () => {
      const onFilesChange = vi.fn();
      const file: UploadedFile = {
        id: 'file-1',
        file: createMockFile('file.png', 1024),
        status: 'success',
        progress: 100
      };

      const store = new TestStore({
        initialState: {
          ...createInitialFileUploadState(),
          files: [file]
        },
        reducer: fileUploadReducer,
        dependencies: { onFilesChange }
      });

      await store.send({ type: 'allFilesCleared' });

      expect(onFilesChange).toHaveBeenCalledWith([]);
    });
  });

  describe('Error Dismissal', () => {
    it('should dismiss error by index', async () => {
      const store = new TestStore({
        initialState: {
          ...createInitialFileUploadState(),
          errors: [
            { type: 'max-size', message: 'Error 1' },
            { type: 'invalid-type', message: 'Error 2' },
            { type: 'max-files', message: 'Error 3' }
          ]
        },
        reducer: fileUploadReducer
      });

      await store.send({ type: 'errorDismissed', index: 1 }, (state) => {
        expect(state.errors.length).toBe(2);
        expect(state.errors[0].message).toBe('Error 1');
        expect(state.errors[1].message).toBe('Error 3');
      });
    });
  });

  describe('Callbacks', () => {
    it('should call onFilesChange when files are added', async () => {
      const onFilesChange = vi.fn();
      const store = new TestStore({
        initialState: createInitialFileUploadState(),
        reducer: fileUploadReducer,
        dependencies: { onFilesChange }
      });

      const files = [createMockFile('file.png', 1024)];

      await store.send({ type: 'filesSelected', files });

      await store.receive({ type: 'filesValidated' });

      expect(onFilesChange).toHaveBeenCalled();
      expect(onFilesChange.mock.calls[0][0].length).toBe(1);
      expect(onFilesChange.mock.calls[0][0][0].file.name).toBe('file.png');
    });

    it('should trigger upload when onUpload is provided', async () => {
      const onUpload = vi.fn().mockResolvedValue(undefined);
      const store = new TestStore({
        initialState: createInitialFileUploadState(),
        reducer: fileUploadReducer,
        dependencies: { onUpload }
      });

      const files = [createMockFile('file.png', 1024)];

      await store.send({ type: 'filesSelected', files });

      await store.receive({ type: 'filesValidated' });
      await store.receive({ type: 'uploadStarted' });
      await store.receive({ type: 'uploadCompleted' });

      expect(onUpload).toHaveBeenCalledWith(files[0]);
    });

    it('should handle upload errors from onUpload', async () => {
      const onUpload = vi.fn().mockRejectedValue(new Error('Upload failed'));
      const store = new TestStore({
        initialState: createInitialFileUploadState(),
        reducer: fileUploadReducer,
        dependencies: { onUpload }
      });

      const files = [createMockFile('file.png', 1024)];

      await store.send({ type: 'filesSelected', files });

      await store.receive({ type: 'filesValidated' });
      await store.receive({ type: 'uploadStarted' });
      await store.receive({ type: 'uploadFailed' }, (state) => {
        expect(state.files[0].status).toBe('error');
        expect(state.files[0].error).toBe('Upload failed');
      });
    });
  });

  describe('Helper Functions', () => {
    it('generateFileId should create unique IDs', () => {
      const id1 = generateFileId();
      const id2 = generateFileId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^file-/);
      expect(id2).toMatch(/^file-/);
    });

    it('formatFileSize should format bytes correctly', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
      expect(formatFileSize(500)).toBe('500 Bytes');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(1024 * 1024)).toBe('1 MB');
      expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
    });
  });

  describe('State Initialization', () => {
    it('should create initial state with defaults', () => {
      const state = createInitialFileUploadState();

      expect(state.files).toEqual([]);
      expect(state.isDragActive).toBe(false);
      expect(state.errors).toEqual([]);
      expect(state.isUploading).toBe(false);
    });
  });
});

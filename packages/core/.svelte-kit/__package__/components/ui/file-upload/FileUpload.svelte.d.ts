interface Props {
    accept?: string;
    multiple?: boolean;
    showPreviews?: boolean;
    maxSize?: number;
    maxFiles?: number;
    dropzoneText?: string;
    onFilesChange?: (files: import('./file-upload.types.js').UploadedFile[]) => void;
    onUpload?: (file: File) => Promise<void>;
    class?: string;
    disabled?: boolean;
}
declare const FileUpload: import("svelte").Component<Props, {}, "">;
type FileUpload = ReturnType<typeof FileUpload>;
export default FileUpload;
//# sourceMappingURL=FileUpload.svelte.d.ts.map
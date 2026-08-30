<script lang="ts">
	import FileUpload from '../../src/lib/components/ui/file-upload/FileUpload.svelte';

	/**
	 * A consumer that wants to report upload progress.
	 *
	 * Nothing renders this — it exists to be *typechecked*, and it is the only
	 * thing that can catch the defect it pins. `file-upload.reducer.ts:69` has
	 * always passed a progress callback as the second argument, so every runtime
	 * test passed while the component declared its own one-parameter copy of
	 * `FileUploadProps` and denied that the argument existed. The value was
	 * there; only the type said otherwise.
	 *
	 * A two-parameter function is not assignable to a one-parameter signature,
	 * so this stops compiling the moment that duplicate comes back.
	 */
	const upload = async (file: File, onProgress: (percent: number) => void): Promise<void> => {
		onProgress(0);
		await new Promise((resolve) => setTimeout(resolve, 0));
		onProgress(100);
	};
</script>

<FileUpload onUpload={upload} accept="image/*" maxSize={1024} />

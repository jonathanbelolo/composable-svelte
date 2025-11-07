/**
 * Streaming Chat Utilities
 *
 * Helper functions for file handling, type detection, and metadata extraction.
 */

import type { MessageAttachment, AttachmentMetadata } from './types.js';

/**
 * Detect file type from MIME type.
 *
 * @param mimeType - The MIME type of the file
 * @returns The attachment type
 */
export function detectFileType(mimeType: string): MessageAttachment['type'] {
	if (mimeType.startsWith('image/')) {
		return 'image';
	}

	if (mimeType.startsWith('video/')) {
		return 'video';
	}

	if (mimeType.startsWith('audio/')) {
		return 'audio';
	}

	if (mimeType === 'application/pdf') {
		return 'pdf';
	}

	// Microsoft Office and OpenDocument formats
	if (
		mimeType.includes('word') ||
		mimeType.includes('excel') ||
		mimeType.includes('powerpoint') ||
		mimeType.includes('openxmlformats') ||
		mimeType.includes('opendocument')
	) {
		return 'document';
	}

	return 'file';
}

/**
 * Extract metadata from a file.
 *
 * @param file - The File object
 * @returns Promise resolving to AttachmentMetadata
 */
export async function extractFileMetadata(file: File): Promise<AttachmentMetadata> {
	const metadata: AttachmentMetadata = {};
	const mimeType = file.type;

	try {
		// Extract image metadata
		if (mimeType.startsWith('image/')) {
			const dimensions = await getImageDimensions(file);
			metadata.width = dimensions.width;
			metadata.height = dimensions.height;
		}

		// Extract video metadata
		if (mimeType.startsWith('video/')) {
			const videoMeta = await getVideoMetadata(file);
			metadata.width = videoMeta.width;
			metadata.height = videoMeta.height;
			metadata.duration = videoMeta.duration;
			metadata.thumbnail = videoMeta.thumbnail;
		}

		// Extract audio metadata
		if (mimeType.startsWith('audio/')) {
			const duration = await getAudioDuration(file);
			metadata.duration = duration;
		}

		// PDF metadata would require PDF.js, skip for now
		// Could add page count extraction here later
	} catch (error) {
		console.warn('Failed to extract file metadata:', error);
	}

	return metadata;
}

/**
 * Get dimensions of an image file.
 *
 * @param file - Image file
 * @returns Promise resolving to {width, height}
 */
function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		const url = URL.createObjectURL(file);

		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve({
				width: img.naturalWidth,
				height: img.naturalHeight
			});
		};

		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Failed to load image'));
		};

		img.src = url;
	});
}

/**
 * Get metadata from a video file.
 *
 * @param file - Video file
 * @returns Promise resolving to {width, height, duration, thumbnail}
 */
function getVideoMetadata(
	file: File
): Promise<{ width: number; height: number; duration: number; thumbnail?: string }> {
	return new Promise((resolve, reject) => {
		const video = document.createElement('video');
		const url = URL.createObjectURL(file);

		video.onloadedmetadata = () => {
			const width = video.videoWidth;
			const height = video.videoHeight;
			const duration = video.duration;

			// Generate thumbnail at 1 second (or start if shorter)
			const thumbnailTime = Math.min(1, duration / 2);
			video.currentTime = thumbnailTime;

			video.onseeked = () => {
				try {
					const canvas = document.createElement('canvas');
					canvas.width = width;
					canvas.height = height;

					const ctx = canvas.getContext('2d');
					if (!ctx) {
						URL.revokeObjectURL(url);
						resolve({ width, height, duration });
						return;
					}

					ctx.drawImage(video, 0, 0, width, height);
					const thumbnail = canvas.toDataURL('image/jpeg', 0.7);

					URL.revokeObjectURL(url);
					resolve({ width, height, duration, thumbnail });
				} catch (error) {
					URL.revokeObjectURL(url);
					resolve({ width, height, duration });
				}
			};
		};

		video.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Failed to load video'));
		};

		video.src = url;
	});
}

/**
 * Get duration of an audio file.
 *
 * @param file - Audio file
 * @returns Promise resolving to duration in seconds
 */
function getAudioDuration(file: File): Promise<number> {
	return new Promise((resolve, reject) => {
		const audio = new Audio();
		const url = URL.createObjectURL(file);

		audio.onloadedmetadata = () => {
			URL.revokeObjectURL(url);
			resolve(audio.duration);
		};

		audio.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Failed to load audio'));
		};

		audio.src = url;
	});
}

/**
 * Format file size in human-readable format.
 *
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
	if (bytes === 0) return '0 Bytes';

	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
}

/**
 * Validate file size against limit.
 *
 * @param file - File to validate
 * @param maxSizeMB - Maximum size in megabytes
 * @returns True if file is within limit
 */
export function validateFileSize(file: File, maxSizeMB: number): boolean {
	const maxBytes = maxSizeMB * 1024 * 1024;
	return file.size <= maxBytes;
}

/**
 * Validate file type against accepted types.
 *
 * @param file - File to validate
 * @param acceptedTypes - Array of MIME types or extensions (e.g., ["image/*", ".pdf"])
 * @returns True if file type is accepted
 */
export function validateFileType(file: File, acceptedTypes: string[]): boolean {
	if (acceptedTypes.length === 0) return true;

	const mimeType = file.type;
	const extension = `.${file.name.split('.').pop()?.toLowerCase()}`;

	return acceptedTypes.some((type) => {
		// Wildcard match (e.g., "image/*")
		if (type.endsWith('/*')) {
			const prefix = type.slice(0, -2);
			return mimeType.startsWith(prefix);
		}

		// Extension match (e.g., ".pdf")
		if (type.startsWith('.')) {
			return extension === type;
		}

		// Exact MIME type match
		return mimeType === type;
	});
}

/**
 * Create a data URL from a file (for previews).
 *
 * @param file - File to convert
 * @returns Promise resolving to data URL
 */
export function createFileDataURL(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();

		reader.onload = () => {
			resolve(reader.result as string);
		};

		reader.onerror = () => {
			reject(new Error('Failed to read file'));
		};

		reader.readAsDataURL(file);
	});
}

/**
 * Create a blob URL from a file (for previews).
 *
 * @param file - File to convert
 * @returns Blob URL
 */
export function createFileBlobURL(file: File): string {
	return URL.createObjectURL(file);
}

/**
 * Revoke a blob URL to free memory.
 *
 * @param url - Blob URL to revoke
 */
export function revokeFileBlobURL(url: string): void {
	if (url.startsWith('blob:')) {
		URL.revokeObjectURL(url);
	}
}

/**
 * Get file extension from filename.
 *
 * @param filename - Name of the file
 * @returns File extension (without dot) or empty string
 */
export function getFileExtension(filename: string): string {
	const parts = filename.split('.');
	return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

/**
 * Get icon name for file type (for UI display).
 *
 * @param type - Attachment type
 * @returns Icon name or emoji
 */
export function getFileTypeIcon(type: MessageAttachment['type']): string {
	switch (type) {
		case 'image':
			return '🖼️';
		case 'video':
			return '🎥';
		case 'audio':
			return '🎵';
		case 'pdf':
			return '📄';
		case 'document':
			return '📝';
		case 'file':
		default:
			return '📎';
	}
}

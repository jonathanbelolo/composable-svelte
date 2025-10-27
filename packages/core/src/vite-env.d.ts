/// <reference types="vite/client" />

/**
 * Type definitions for Vite environment variables.
 *
 * This file extends ImportMeta with Vite-specific properties used
 * for development-only warnings and debugging.
 */
interface ImportMetaEnv {
	readonly DEV: boolean;
	readonly PROD: boolean;
	readonly MODE: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

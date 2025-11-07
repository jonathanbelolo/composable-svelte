import { AudioManager } from './audio-manager.js';

/**
 * Global registry for AudioManager instances.
 * Maps IDs to AudioManager instances for lookup by reducers.
 *
 * @example
 * ```typescript
 * const manager = createAudioManager('voice-input-1');
 * manager.requestMicrophone();
 *
 * // Later, in reducer:
 * const manager = getAudioManager('voice-input-1');
 * manager.startRecording();
 *
 * // On cleanup:
 * deleteAudioManager('voice-input-1');
 * ```
 */

const audioManagers = new Map<string, AudioManager>();

/**
 * Create a new AudioManager instance and register it.
 * @param id Unique identifier for this audio manager
 * @returns The created AudioManager instance
 */
export function createAudioManager(id: string): AudioManager {
	const manager = new AudioManager();
	audioManagers.set(id, manager);
	return manager;
}

/**
 * Get an AudioManager instance by ID.
 * @param id The audio manager ID
 * @returns The AudioManager instance, or undefined if not found
 */
export function getAudioManager(id: string): AudioManager | undefined {
	return audioManagers.get(id);
}

/**
 * Delete an AudioManager instance and clean up its resources.
 * @param id The audio manager ID
 */
export function deleteAudioManager(id: string): void {
	const manager = audioManagers.get(id);
	if (manager) {
		manager.cleanup();
		audioManagers.delete(id);
	}
}

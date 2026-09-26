/**
 * AudioManager class
 *
 * Manages non-serializable audio objects (MediaStream, AudioContext, MediaRecorder)
 * outside of Svelte reactive state. Instances are stored in a registry and referenced
 * by ID in the state.
 *
 * @example
 * ```typescript
 * const manager = new AudioManager();
 * const stream = await manager.requestMicrophone();
 * manager.startRecording();
 * const audioBlob = await manager.stopRecording();
 * manager.cleanup();
 * ```
 */
export class AudioManager {
	private stream: MediaStream | null = null;
	private context: AudioContext | null = null;
	private analyzer: AnalyserNode | null = null;
	private recorder: MediaRecorder | null = null;
	private chunks: Blob[] = [];
	private pendingStop: { recorder: MediaRecorder; promise: Promise<Blob> } | null = null;
	private intervals: Set<number> = new Set();

	/**
	 * Request microphone access and setup audio analysis.
	 * @returns MediaStream for the microphone
	 * @throws Error if permission denied or no microphone available
	 */
	async requestMicrophone(): Promise<MediaStream> {
		this.stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true,
				sampleRate: 16000 // Optimal for speech recognition
			}
		});

		// Setup audio analysis
		this.context = new AudioContext();
		const source = this.context.createMediaStreamSource(this.stream);
		this.analyzer = this.context.createAnalyser();
		this.analyzer.fftSize = 256;
		source.connect(this.analyzer);

		return this.stream;
	}

	/**
	 * Start recording audio from the microphone.
	 * @throws Error if no stream available
	 */
	startRecording(): void {
		if (!this.stream) {
			throw new Error('No stream available. Call requestMicrophone() first.');
		}

		let options: MediaRecorderOptions | undefined;
		const candidates = [
			'audio/webm;codecs=opus',
			'audio/webm',
			'audio/mp4;codecs=mp4a.40.2',
			'audio/mp4',
			'audio/ogg;codecs=opus',
			'audio/ogg'
		];

		if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
			const supported = candidates.find((type) => MediaRecorder.isTypeSupported(type));
			if (supported) {
				options = { mimeType: supported };
			}
		}

		this.recorder = options ? new MediaRecorder(this.stream, options) : new MediaRecorder(this.stream);

		const chunks: Blob[] = [];
		this.chunks = chunks;

		this.recorder.ondataavailable = (e) => {
			if (e.data.size > 0) {
				chunks.push(e.data);
			}
		};

		this.recorder.start();
	}

	/**
	 * Stop recording and return the audio blob.
	 * @returns Promise that resolves with the audio blob
	 * @throws Error if no recorder available
	 */
	stopRecording(): Promise<Blob> {
		const recorder = this.recorder;
		if (!recorder) return Promise.reject(new Error('No recorder available'));
		if (this.pendingStop?.recorder === recorder) return this.pendingStop.promise;
		const chunks = this.chunks;
		let resolveStop!: (blob: Blob) => void;
		let rejectStop!: (error: unknown) => void;
		const promise = new Promise<Blob>((resolve, reject) => {
			resolveStop = resolve;
			rejectStop = reject;
		});
		this.pendingStop = { recorder, promise };
		const retire = () => {
			if (this.recorder === recorder) this.recorder = null;
			if (this.pendingStop?.recorder === recorder) this.pendingStop = null;
		};
		recorder.onstop = () => {
			const mimeType = recorder.mimeType || chunks[0]?.type || '';
			retire();
			resolveStop(new Blob(chunks, { type: mimeType }));
		};
		try {
			recorder.stop();
		} catch (error) {
			retire();
			recorder.onstop = null;
			rejectStop(error);
		}
		return promise;
	}

	/**
	 * Get current audio level (0-100).
	 * @returns Audio level as a percentage
	 */
	getAudioLevel(): number {
		if (!this.analyzer) return 0;

		const dataArray = new Uint8Array(this.analyzer.frequencyBinCount);
		this.analyzer.getByteFrequencyData(dataArray);

		const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
		return Math.round((average / 255) * 100);
	}

	/**
	 * Detect voice activity using simple threshold-based detection.
	 * @param threshold Audio level threshold (default: 15)
	 * @returns true if speech detected
	 */
	detectVoiceActivity(threshold = 15): boolean {
		return this.getAudioLevel() > threshold;
	}

	/**
	 * Start monitoring audio levels at given interval.
	 * Returns interval ID for cleanup.
	 *
	 * @param callback Function called with audio level
	 * @param intervalMs Interval in milliseconds (default: 50ms = 20fps)
	 * @returns Interval ID
	 */
	startAudioLevelMonitoring(callback: (level: number) => void, intervalMs = 50): number {
		const id = setInterval(() => {
			const level = this.getAudioLevel();
			callback(level);
		}, intervalMs) as unknown as number;

		this.intervals.add(id);
		return id;
	}

	/**
	 * Stop specific interval.
	 * @param id Interval ID returned from startAudioLevelMonitoring
	 */
	stopInterval(id: number): void {
		clearInterval(id);
		this.intervals.delete(id);
	}

	/**
	 * Clean up all audio resources.
	 * Call this when component unmounts or voice input is deactivated.
	 */
	cleanup(): void {
		// Clear all intervals
		this.intervals.forEach((id) => clearInterval(id));
		this.intervals.clear();

		// Stop all audio tracks (releases microphone)
		if (this.stream) {
			this.stream.getTracks().forEach((track) => track.stop());
			this.stream = null;
		}

		// Close audio context
		if (this.context) {
			this.context.close();
			this.context = null;
		}

		// Clear references
		this.recorder = null;
		this.pendingStop = null;
		this.analyzer = null;
		this.chunks = [];
	}
}

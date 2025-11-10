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

		this.recorder = new MediaRecorder(this.stream, {
			mimeType: 'audio/webm;codecs=opus'
		});

		this.chunks = [];

		this.recorder.ondataavailable = (e) => {
			if (e.data.size > 0) {
				this.chunks.push(e.data);
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
		return new Promise((resolve, reject) => {
			if (!this.recorder) {
				reject(new Error('No recorder available'));
				return;
			}

			this.recorder.onstop = () => {
				const audioBlob = new Blob(this.chunks, { type: 'audio/webm' });
				resolve(audioBlob);
			};

			this.recorder.stop();
		});
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
		this.analyzer = null;
		this.chunks = [];
	}
}

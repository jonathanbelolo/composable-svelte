import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioManager } from '../src/lib/voice-input/audio/audio-manager';
import { detectVideo, getPlatformConfig, extractVideosFromMarkdown } from '../src/lib/video-embed/video-detection';

afterEach(() => vi.unstubAllGlobals());
function engine(supported: string | null, actual = 'audio/mp4') {
 const instances: Recorder[] = [];
 class Recorder {
  static isTypeSupported = (type: string) => type === supported;
  mimeType: string; ondataavailable: ((event: {data: Blob}) => void) | null = null;
  onstop: (() => void) | null = null; stop = vi.fn(); start = vi.fn();
  constructor(_stream: unknown, options?: MediaRecorderOptions) {
   if (options?.mimeType && options.mimeType !== supported) throw new Error('unsupported');
   this.mimeType = options?.mimeType ?? actual; instances.push(this);
  }
  complete(text: string) { this.ondataavailable?.({data: new Blob([text], {type: this.mimeType})}); this.onstop?.(); }
 }
 vi.stubGlobal('MediaRecorder', Recorder);
 vi.stubGlobal('navigator', {mediaDevices:{getUserMedia: async () => ({getTracks:()=>[]})}});
 vi.stubGlobal('AudioContext', class { createMediaStreamSource(){return {connect(){}};} createAnalyser(){return {};} });
 return { instances, Recorder };
}
describe('recording engine MIME and stop ownership', () => {
 it.each(['audio/mp4','audio/webm;codecs=opus'])('selects supported %s and labels actual bytes', async mime => {
  const {instances}=engine(mime); const manager=new AudioManager(); await manager.requestMicrophone(); manager.startRecording();
  const result=manager.stopRecording(); instances[0]!.complete('bytes'); expect((await result).type).toBe(mime);
 });
 it.each([true,false])('uses engine default when support list unavailable or empty: %s',async missing => {
  const {instances,Recorder}=engine(null); if(missing) Object.defineProperty(Recorder,'isTypeSupported',{value:undefined});
  const manager=new AudioManager();await manager.requestMicrophone();manager.startRecording();const result=manager.stopRecording();instances[0]!.complete('default');expect((await result).type).toBe('audio/mp4');
 });
 it('joins duplicate pending stops and keeps each recording chunks independent',async()=>{
  const {instances}=engine('audio/webm;codecs=opus');const manager=new AudioManager();await manager.requestMicrophone();manager.startRecording();
  const first=manager.stopRecording();expect(manager.stopRecording()).toBe(first);expect(instances[0]!.stop).toHaveBeenCalledTimes(1);
  manager.startRecording();const second=manager.stopRecording();instances[1]!.complete('second');instances[0]!.complete('first');
  expect(await (await first).text()).toBe('first');expect(await (await second).text()).toBe('second');
  await expect(manager.stopRecording()).rejects.toThrow('No recorder');
 });
 it('old stop completion cannot consume a replacement recording chunks',async()=>{
  const{instances}=engine('audio/webm;codecs=opus');const manager=new AudioManager();await manager.requestMicrophone();manager.startRecording();const first=manager.stopRecording();manager.startRecording();const second=manager.stopRecording();instances[1]!.complete('second');instances[0]!.complete('first');expect(await(await first).text()).toBe('first');expect(await(await second).text()).toBe('second');
 });
 it('retires failed stop ownership and allows a new recording',async()=>{
  const{instances}=engine('audio/webm;codecs=opus');const manager=new AudioManager();await manager.requestMicrophone();manager.startRecording();instances[0]!.stop.mockImplementation(()=>{throw new DOMException('inactive','InvalidStateError');});await expect(manager.stopRecording()).rejects.toThrow('inactive');await expect(manager.stopRecording()).rejects.toThrow('No recorder');manager.startRecording();const result=manager.stopRecording();instances[1]!.complete('recovered');expect(await(await result).text()).toBe('recovered');
 });
 it('cleanup does not lose an already pending native completion',async()=>{
  const{instances}=engine('audio/webm;codecs=opus');vi.stubGlobal('AudioContext',class{createMediaStreamSource(){return{connect(){}};}createAnalyser(){return{};}close(){return Promise.resolve();}});const manager=new AudioManager();await manager.requestMicrophone();manager.startRecording();const result=manager.stopRecording();manager.cleanup();await Promise.resolve();instances[0]!.complete('final');expect(await(await result).text()).toBe('final');
 });
 it('retains no-recorder rejection',async()=>{await expect(new AudioManager().stopRecording()).rejects.toThrow('No recorder');});
});
it('preserves complete video URL occurrence order, query and fragments',()=>{
 const a='https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12#chapter'; const b='https://vimeo.com/76979871?autoplay=1#start';
 expect(extractVideosFromMarkdown(`[watch](${b}), then <${a}> and ${b}.`).map(v=>v.url)).toEqual([b,a,b]);
});
it('retains supported bare URLs while ignoring unrelated links',()=>{
 expect(extractVideosFromMarkdown('vimeo.com/76979871 https://example.org/image.png').map(v=>v.url)).toEqual(['vimeo.com/76979871']);
});

it.each(['https://not-youtube.com/watch?v=dQw4w9WgXcQ','https://example.org/youtube.com/watch?v=dQw4w9WgXcQ','not-youtube.com/watch?v=dQw4w9WgXcQ'])('rejects non-platform URL %s consistently',url=>{expect(detectVideo(url)).toBeNull();expect(getPlatformConfig('youtube')!.extractId(url)).toBeNull();expect(extractVideosFromMarkdown(url)).toEqual([]);});

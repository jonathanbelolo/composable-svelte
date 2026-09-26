import {describe,it,expect,vi} from 'vitest';
import {AudioManager} from '../src/lib/audio-player/audio-manager.js';
import {audioPlayerReducer as reduce} from '../src/lib/audio-player/reducer.js';
import {createInitialAudioPlayerState, type AudioPlayerState, type AudioTrack} from '../src/lib/audio-player/types.js';
const tracks: AudioTrack[] = ['a','b','c'].map(id=>({id,title:id,url:`/${id}.mp3`}));
const initial = (): AudioPlayerState => ({...createInitialAudioPlayerState(), playlist: tracks, currentTrack:tracks[1]!, currentTrackIndex:1, isShuffled:true, shuffleOrder:[1,2,0]});
const order = (s:ReturnType<typeof initial>) => s.shuffleOrder.map(i=>s.playlist[i]?.id);
describe('shuffle identity through edits',()=>{
 it('keeps playback order through forward and backward reorder',()=>{
  let s=initial(); [s]=reduce(s,{type:'playlistReordered',from:1,to:2},{}); expect(order(s)).toEqual(['b','c','a']); expect(s.playlist[s.currentTrackIndex]).toBe(s.currentTrack);
  [s]=reduce(s,{type:'playlistReordered',from:2,to:0},{}); expect(order(s)).toEqual(['b','c','a']); expect(s.playlist[s.currentTrackIndex]).toBe(s.currentTrack);
  [s]=reduce(s,{type:'next'},{});expect(s.currentTrack?.id).toBe('c');
 });
 it.each([0,1,2])('removes track %i without invalid shuffle indices',index=>{
  const [s]=reduce(initial(),{type:'trackRemoved',index},{}); expect(order(s)).toEqual(['b','c','a'].filter(id=>id!==tracks[index]!.id));expect(s.playlist[s.currentTrackIndex]).toBe(s.currentTrack);
 });
 it('appends new tracks to reachable order and resets last removal',()=>{
  let s=initial();[s]=reduce(s,{type:'trackAdded',track:{id:'d',title:'d',url:'/d'}},{});expect(order(s)).toEqual(['b','c','a','d']);
  while(s.playlist.length) [s]=reduce(s,{type:'trackRemoved',index:0},{});expect(s.shuffleOrder).toEqual([]);
  [s]=reduce(s,{type:'trackAdded',track:tracks[0]!},{});expect(s.shuffleOrder).toEqual([0]);
 });
 it.each([-1,3,1.5,NaN])('rejects invalid index %s atomically',index=>{
  const s=initial();expect(reduce(s,{type:'trackRemoved',index},{})[0]).toBe(s);expect(reduce(s,{type:'playlistReordered',from:1,to:index},{})[0]).toBe(s);expect(reduce(s,{type:'playlistReordered',from:index,to:1},{})[0]).toBe(s);
 });
});
describe('audio engine completion',()=>{
 const engine=(play:()=>Promise<void>)=>({play,pause:vi.fn(),load:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),src:''}) as unknown as HTMLAudioElement;
 it('drops normal AbortError interruption',async()=>{const action=vi.fn();const manager=new AudioManager({onAction:action,createAudioElement:()=>engine(()=>Promise.reject(new DOMException('interrupted','AbortError')))});await manager.play();expect(action).not.toHaveBeenCalled();manager.dispose();});
 it('retains actual playback failure',async()=>{const action=vi.fn();const log=vi.spyOn(console,'error').mockImplementation(()=>{});const manager=new AudioManager({onAction:action,createAudioElement:()=>engine(()=>Promise.reject(new Error('denied')))});await manager.play();expect(action).toHaveBeenCalledWith({type:'error',error:'denied'});manager.dispose();log.mockRestore();});
 it('does not dispatch a rejection after disposal',async()=>{let reject!:(e:Error)=>void;const action=vi.fn();const manager=new AudioManager({onAction:action,createAudioElement:()=>engine(()=>new Promise((_,r)=>{reject=r;}))});const pending=manager.play();manager.dispose();reject(new Error('retired'));await pending;expect(action).not.toHaveBeenCalled();});
});

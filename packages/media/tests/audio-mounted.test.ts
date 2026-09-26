import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import {createStore} from '@composable-svelte/core';
import Minimal from '../src/lib/audio-player/MinimalAudioPlayer.svelte';
import Full from '../src/lib/audio-player/FullAudioPlayer.svelte';
import {audioPlayerReducer} from '../src/lib/audio-player/reducer.js';
import {createInitialAudioPlayerState,type AudioPlayerAction} from '../src/lib/audio-player/types.js';
import {getAudioManager,deleteAudioManager} from '../src/lib/audio-player/audio-manager.js';
import {createLibrary,track} from './fixtures/managed-players.js';
import PlayerRebind from './fixtures/PlayerRebind.svelte';
class FakeAudio extends EventTarget {
 static instances:FakeAudio[]=[];
 src='';paused=true;currentTime=0;duration=120;volume=1;playbackRate=1;muted=false;buffered={length:0,end:()=>0};
 constructor(){super();FakeAudio.instances.push(this);}
 play=vi.fn(async()=>{this.paused=false;});pause=vi.fn(()=>{this.paused=true;});load=vi.fn();
 /** Fire a native event and let the component react. */
 emit(type:string,currentTime?:number){if(currentTime!==undefined)this.currentTime=currentTime;this.dispatchEvent(new Event(type));flushSync();}
}
const cleanups:Array<()=>void|Promise<void>>=[];
beforeEach(()=>{FakeAudio.instances=[];vi.stubGlobal('Audio',FakeAudio);});
afterEach(async()=>{for(const cleanup of cleanups.reverse())await cleanup();cleanups.length=0;vi.unstubAllGlobals();});
function setup(Component:typeof Minimal|typeof Full,id?:string){
 const track={id:'a',title:'A',url:'/a.mp3',duration:120};
 const store=createStore({initialState:{...createInitialAudioPlayerState(),playlist:[track],currentTrack:track,currentTrackIndex:0,duration:120},reducer:audioPlayerReducer,dependencies:{}});
 const target=document.createElement('div');document.body.append(target);const component=mount(Component,{target,props:{store,id}});flushSync();let alive=true;
 const dispose=async()=>{if(!alive)return;alive=false;await unmount(component);target.remove();store.destroy();};cleanups.push(dispose);return {store,target,dispose};
}
/** Mount any player on any store or view; the caller's store outlives the component. */
function place(Component:typeof Minimal|typeof Full,props:Record<string,unknown>){
 const target=document.createElement('div');document.body.append(target);const component=mount(Component,{target,props:props as never});flushSync();let alive=true;
 const dispose=async()=>{if(!alive)return;alive=false;await unmount(component);target.remove();};cleanups.push(dispose);return {target,dispose};
}
const click=(root:Element,label:string)=>{root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click();flushSync();};
const settle=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
function key(target:Element,key:string,extra:KeyboardEventInit={}){const event=new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra});target.dispatchEvent(event);flushSync();return event;}
describe('mounted audio resource boundaries',()=>{
 it.each([['minimal',Minimal],['full',Full]] as const)('%s instances own separate audio callbacks and cleanup',async(_,Component)=>{
  const a=setup(Component);const b=setup(Component);expect(FakeAudio.instances).toHaveLength(2);const [first,second]=FakeAudio.instances;
  first!.currentTime=23;first!.dispatchEvent(new Event('timeupdate'));flushSync();expect(a.store.state.currentTime).toBe(23);expect(b.store.state.currentTime).toBe(0);
  await a.dispose();expect(first!.src).toBe('');expect(second!.src).toBe('/a.mp3');second!.currentTime=45;second!.dispatchEvent(new Event('timeupdate'));flushSync();expect(b.store.state.currentTime).toBe(45);
 });
 it('shortcuts belong to the focused player region, not the page or sibling',()=>{
  const a=setup(Full);const b=setup(Full);const outside=document.createElement('button');document.body.append(outside);cleanups.push(()=>outside.remove());outside.focus();expect(key(outside,' ' ).defaultPrevented).toBe(false);expect(key(outside,'k').defaultPrevented).toBe(false);expect(a.store.state.isPlaying).toBe(false);expect(b.store.state.isPlaying).toBe(false);
  const region=a.target.querySelector<HTMLElement>('[role=region]')!;region.focus();expect(key(region,'k').defaultPrevented).toBe(true);expect(a.store.state.isPlaying).toBe(true);expect(b.store.state.isPlaying).toBe(false);
  expect(key(region,'k',{ctrlKey:true}).defaultPrevented).toBe(false);expect(a.store.state.isPlaying).toBe(true);
 });
 it('native button activation and editable descendants retain their keys',()=>{
  const a=setup(Full);const button=a.target.querySelector<HTMLButtonElement>('button[aria-label="Play"]')!;expect(key(button,' ').defaultPrevented).toBe(false);expect(a.store.state.isPlaying).toBe(false);button.click();flushSync();expect(a.store.state.isPlaying).toBe(true);
  const edit=document.createElement('div');edit.contentEditable='true';const span=document.createElement('span');edit.append(span);a.target.querySelector('[role=region]')!.append(edit);expect(key(span,'k').defaultPrevented).toBe(false);expect(a.store.state.isPlaying).toBe(true);
 });
 it.each(['first','second'] as const)('two players given one explicit id each keep their own element; unmounting the %s leaves the other playing',async(which)=>{
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  const a=setup(Full,'shared');const b=setup(Full,'shared');
  expect(FakeAudio.instances).toHaveLength(2);
  expect(warn).toHaveBeenCalledTimes(1);expect(String(warn.mock.calls[0]![0])).toContain('"shared"');
  warn.mockRestore();
  const [first,second]=FakeAudio.instances as [FakeAudio,FakeAudio];
  // Callbacks are not redirected: each element reports to its own store.
  first.emit('timeupdate',31);second.emit('timeupdate',7);
  expect(a.store.state.currentTime).toBe(31);expect(b.store.state.currentTime).toBe(7);
  click(a.target,'Play');click(b.target,'Play');await settle();
  expect(first.paused).toBe(false);expect(second.paused).toBe(false);
  const [gone,kept,keptStore,keptTarget]=which==='first'?[first,second,b.store,b.target] as const:[second,first,a.store,a.target] as const;
  await (which==='first'?a:b).dispose();
  expect(gone.paused).toBe(true);expect(gone.src).toBe('');
  // The survivor was neither disposed nor silenced, and still obeys its store.
  expect(kept.src).toBe('/a.mp3');expect(kept.paused).toBe(false);
  kept.emit('timeupdate',42);expect(keptStore.state.currentTime).toBe(42);
  click(keptTarget,'Pause');expect(kept.paused).toBe(true);
  click(keptTarget,'Play');await settle();expect(kept.paused).toBe(false);
  // The name belonged to the later player; releasing the earlier one left it alone.
  const lookup=vi.spyOn(console,'warn').mockImplementation(()=>{});
  const named=getAudioManager('shared',{onAction:()=>{}});
  expect(named.getAudioElement()).toBe(which==='first'?second:FakeAudio.instances[2]);
  expect(lookup).toHaveBeenCalledTimes(which==='first'?1:0);
  lookup.mockRestore();
  if(which==='second')deleteAudioManager('shared');
 });
 it.each([['minimal',Minimal],['full',Full]] as const)('%s player drives its element from state',async(_,Component)=>{
  const a=setup(Component);const element=FakeAudio.instances[0]!;
  expect(element.src).toBe('/a.mp3');
  click(a.target,'Play');await settle();
  expect(element.play).toHaveBeenCalledTimes(1);expect(element.paused).toBe(false);
  a.store.dispatch({type:'volumeChanged',volume:0.3});a.store.dispatch({type:'speedChanged',speed:1.5});a.store.dispatch({type:'seekTo',time:60});flushSync();
  expect(element.volume).toBe(0.3);expect(element.playbackRate).toBe(1.5);expect(element.currentTime).toBe(60);
  // A position reported by the element is not echoed back as a seek.
  element.emit('timeupdate',61);expect(element.currentTime).toBe(61);
  click(a.target,'Pause');expect(element.paused).toBe(true);expect(element.play).toHaveBeenCalledTimes(1);
 });
 it.each([
  ['NotAllowedError',1],
  ['AbortError',0]
 ] as const)('a play() rejected with %s reports %i error and does not retry',async(name,errors)=>{
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  const a=setup(Full);const element=FakeAudio.instances[0]!;
  element.play=vi.fn(()=>Promise.reject(new DOMException('rejected',name)));
  const actions:AudioPlayerAction[]=[];a.store.subscribeToActions?.(action=>{actions.push(action);});
  click(a.target,'Play');await settle();flushSync();await settle();
  expect(actions.filter(action=>action.type==='error')).toHaveLength(errors);
  expect(a.store.state.isPlaying).toBe(errors===0);
  expect(element.play).toHaveBeenCalledTimes(1);
  log.mockRestore();
 });
});
describe('the public registry and mounted players',()=>{
 const warnings=()=>{const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});cleanups.push(()=>warn.mockRestore());return {warn,texts:()=>warn.mock.calls.map(([text])=>String(text))};};
 it('deleteAudioPlayerManager(id) on a mounted player removes the name and leaves the player working',async()=>{
  const {warn,texts}=warnings();
  const a=setup(Full,'p1');const element=FakeAudio.instances[0]!;
  deleteAudioManager('p1');
  expect(warn).toHaveBeenCalledTimes(1);expect(texts()[0]).toContain('"p1" belongs to a mounted player');
  expect(element.src).toBe('/a.mp3');
  click(a.target,'Play');await settle();
  expect(element.play).toHaveBeenCalledTimes(1);expect(element.paused).toBe(false);expect(a.store.state.isPlaying).toBe(true);
  element.emit('timeupdate',9);expect(a.store.state.currentTime).toBe(9);
  // The name is gone: a lookup creates an unrelated manager, which the caller owns and may delete.
  const fresh=getAudioManager('p1',{onAction:()=>{}});
  expect(fresh.getAudioElement()).not.toBe(element);
  deleteAudioManager('p1');expect(fresh.disposed).toBe(true);
  expect(element.paused).toBe(false);expect(element.src).toBe('/a.mp3');
  // The player is still the one that releases its element.
  await a.dispose();expect(element.paused).toBe(true);expect(element.src).toBe('');
 });
 it('a manager the application registered under a player\'s id stays registered, and the player is not mistaken for another player',async()=>{
  const {warn,texts}=warnings();
  const appActions:AudioPlayerAction[]=[];
  const app=getAudioManager('p2',{onAction:action=>{appActions.push(action);}});
  const appElement=FakeAudio.instances[0]!;
  const a=setup(Full,'p2');const playerElement=FakeAudio.instances[1]!;
  expect(FakeAudio.instances).toHaveLength(2);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(texts()[0]).toContain('"p2" is registered by getAudioPlayerManager()');
  expect(texts()[0]).not.toContain('another mounted player');
  // The application's registration is untouched and still reports to the application.
  expect(getAudioManager('p2',{onAction:action=>{appActions.push(action);}})).toBe(app);
  expect(app.disposed).toBe(false);
  appElement.emit('timeupdate',5);expect(appActions.map(action=>action.type)).toEqual(['timeUpdated']);
  expect(a.store.state.currentTime).toBe(0);
  // Deleting the application's name disposes the application's manager, never the player's.
  deleteAudioManager('p2');
  expect(app.disposed).toBe(true);expect(appElement.src).toBe('');
  click(a.target,'Play');await settle();
  expect(playerElement.play).toHaveBeenCalledTimes(1);expect(playerElement.paused).toBe(false);
  playerElement.emit('timeupdate',8);expect(a.store.state.currentTime).toBe(8);
  expect(warn).toHaveBeenCalledTimes(1);
 });
 it('getAudioPlayerManager(id, config) on a mounted player\'s name does not redirect its events',()=>{
  const {warn,texts}=warnings();
  const a=setup(Full,'p3');const element=FakeAudio.instances[0]!;
  const spy=vi.fn();
  const found=getAudioManager('p3',{onAction:spy});getAudioManager('p3',{onAction:spy});
  expect(found.getAudioElement()).toBe(element);
  expect(warn).toHaveBeenCalledTimes(1);expect(texts()[0]).toContain('were not replaced');
  element.emit('timeupdate',14);
  expect(spy).not.toHaveBeenCalled();expect(a.store.state.currentTime).toBe(14);
 });
 it('a standalone manager keeps its get-or-create, reconfigure and dispose behaviour',()=>{
  const {warn}=warnings();
  const first=vi.fn();const second=vi.fn();
  const manager=getAudioManager('solo',{onAction:first});
  expect(getAudioManager('solo',{onAction:second})).toBe(manager);
  FakeAudio.instances[0]!.emit('timeupdate',2);
  expect(first).not.toHaveBeenCalled();expect(second).toHaveBeenCalledTimes(1);
  deleteAudioManager('solo');expect(manager.disposed).toBe(true);
  expect(warn).not.toHaveBeenCalled();
 });
});
describe('live-to-live store swap',()=>{
 it('a player moved from one live standalone store to another releases the first element and reports only to the second',async()=>{
  const make=(url:string)=>{const t={id:url,title:url,url,duration:120};const store=createStore({initialState:{...createInitialAudioPlayerState(),playlist:[t],currentTrack:t,currentTrackIndex:0,duration:120},reducer:audioPlayerReducer,dependencies:{}});cleanups.push(()=>store.destroy());return store;};
  const a=make('/a.mp3');const b=make('/b.mp3');
  const received={a:[] as string[],b:[] as string[]};
  a.subscribeToActions?.(action=>{received.a.push(action.type);});b.subscribeToActions?.(action=>{received.b.push(action.type);});
  const target=document.createElement('div');document.body.append(target);
  const component=mount(PlayerRebind,{target,props:{store:a}});flushSync();
  cleanups.push(async()=>{await unmount(component);target.remove();});
  const first=FakeAudio.instances[0]!;
  click(target,'Play');await settle();expect(first.paused).toBe(false);
  received.a.length=0;
  component.rebind(b);flushSync();
  // `a` is still live throughout: only the prop changed.
  expect(a.state.isPlaying).toBe(true);
  expect(FakeAudio.instances).toHaveLength(2);const second=FakeAudio.instances[1]!;
  expect(first.paused).toBe(true);expect(first.src).toBe('');expect(second.src).toBe('/b.mp3');
  expect(received.b.filter(type=>type==='restorePreferences')).toHaveLength(1);
  first.emit('timeupdate',70);second.emit('timeupdate',6);
  expect(a.state.currentTime).toBe(0);expect(b.state.currentTime).toBe(6);
  expect(received.a).toEqual([]);
  click(target,'Play');await settle();
  expect(b.state.isPlaying).toBe(true);expect(second.paused).toBe(false);expect(first.play).toHaveBeenCalledTimes(1);
 });
});
describe('managed views',()=>{
 it('a player that outlives its owner releases the element at retirement and dispatches nothing more',async()=>{
  const {store,bind}=createLibrary(['a','b']);cleanups.push(()=>store.destroy());
  const a=place(Full,{store:bind('a')});const b=place(Full,{store:bind('b')});
  const [first,second]=FakeAudio.instances as [FakeAudio,FakeAudio];
  click(a.target,'Play');click(b.target,'Play');await settle();
  expect(first.paused).toBe(false);expect(second.paused).toBe(false);
  const actions:unknown[]=[];store.subscribeToActions?.(action=>{actions.push(action);});
  store.dispatch({type:'remove',id:'a'});flushSync();actions.length=0;
  // Still mounted, but its owner is gone: nothing rendered, element released.
  expect(a.target.querySelector('[role=region]')).toBeNull();
  expect(first.paused).toBe(true);expect(first.src).toBe('');
  first.emit('timeupdate',50);first.emit('ended');
  expect(actions).toEqual([]);
  // The sibling keeps its element, its playback and its callbacks.
  expect(second.paused).toBe(false);
  second.emit('timeupdate',12);
  expect(store.state.players.find(row=>row.id==='b')!.state.currentTime).toBe(12);
  await a.dispose();expect(second.paused).toBe(false);
 });
 it('a replaced owner gets a fresh element, and the old element never reaches the replacement',async()=>{
  const {store,bind}=createLibrary(['a']);cleanups.push(()=>store.destroy());
  const old=place(Full,{store:bind('a')});const previous=FakeAudio.instances[0]!;
  click(old.target,'Play');await settle();
  store.dispatch({type:'replace',id:'a',track:track('z')});flushSync();
  expect(previous.paused).toBe(true);expect(previous.src).toBe('');
  const next=place(Full,{store:bind('a')});const replacement=FakeAudio.instances[1]!;
  expect(replacement.src).toBe('/z.mp3');
  previous.emit('timeupdate',99);
  expect(store.state.players[0]!.state.currentTime).toBe(0);
  replacement.emit('timeupdate',3);
  expect(store.state.players[0]!.state.currentTime).toBe(3);
  await old.dispose();await next.dispose();
 });
 it('an unkeyed player whose store prop changes rebinds its element to the new store',async()=>{
  const {store,bind}=createLibrary(['a']);cleanups.push(()=>store.destroy());
  const target=document.createElement('div');document.body.append(target);
  const component=mount(PlayerRebind,{target,props:{store:bind('a')}});flushSync();
  cleanups.push(async()=>{await unmount(component);target.remove();});
  const previous=FakeAudio.instances[0]!;
  store.dispatch({type:'replace',id:'a',track:track('z')});flushSync();
  component.rebind(bind('a'));flushSync();
  expect(FakeAudio.instances).toHaveLength(2);
  const current=FakeAudio.instances[1]!;
  expect(previous.src).toBe('');expect(current.src).toBe('/z.mp3');
  previous.emit('timeupdate',80);current.emit('timeupdate',4);
  expect(store.state.players[0]!.state.currentTime).toBe(4);
  expect(target.querySelector('.track-title-large')!.textContent).toBe('Z');
 });
});

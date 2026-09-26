import {afterEach,expect,it,vi} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import {createStore,Effect} from '@composable-svelte/core';
import {createInitialVoiceInputState,type VoiceInputAction,type VoiceInputState} from '../src/lib/voice-input/types';
import VoiceInputButton from '../src/lib/voice-input/components/VoiceInputButton.svelte';
import ConversationModePanel from '../src/lib/voice-input/components/ConversationModePanel.svelte';
import RecordingTimerHarness from './fixtures/RecordingTimerHarness.svelte';
const cleanups:Array<()=>void>=[];
afterEach(()=>{for(const f of cleanups.splice(0))f();vi.useRealTimers();});
function control(initial:Partial<VoiceInputState>={},pending=false){
 const actions:VoiceInputAction[]=[];
 const store=createStore<VoiceInputState,VoiceInputAction>({initialState:{...createInitialVoiceInputState(),...initial},reducer:(state,action)=>{
  actions.push(action);
  if(action.type==='startPushToTalkRecording')return[{...state,status:pending?'requesting-permission':'recording'},Effect.none()];
  if(action.type==='stopPushToTalkRecording'||action.type==='cancelPushToTalkRecording')return[{...state,status:'idle'},Effect.none()];
  return[state,Effect.none()];
 }});
 cleanups.push(()=>store.destroy());return{store,actions};
}
function target(){const node=document.createElement('div');document.body.append(node);cleanups.push(()=>node.remove());return node;}
function key(node:HTMLElement,type:string,value:string,repeat=false){node.dispatchEvent(new KeyboardEvent(type,{key:value,repeat,bubbles:true,cancelable:true}));flushSync();}
it.each([' ','Enter'])('push-to-talk keyboard hold %s starts once and releases once',value=>{
 const {store,actions}=control();const node=target();const component=mount(VoiceInputButton,{target:node,props:{store}});cleanups.push(()=>{void unmount(component);});flushSync();const button=node.querySelector('button')!;
 key(button,'keydown',value);key(button,'keydown',value,true);expect(actions.map(a=>a.type)).toEqual(['startPushToTalkRecording']);
 key(button,'keyup',value);button.click();expect(actions.map(a=>a.type)).toEqual(['startPushToTalkRecording','stopPushToTalkRecording']);
});
it.each(['keyup','blur'])('pending permission hold %s cancels intent',event=>{
 const{store,actions}=control({},true);const node=target();const component=mount(VoiceInputButton,{target:node,props:{store}});cleanups.push(()=>{void unmount(component);});flushSync();const button=node.querySelector('button')!;
 key(button,'keydown',' ');if(event==='keyup')key(button,'keyup',' ');else button.dispatchEvent(new FocusEvent('blur'));
 expect(actions.map(a=>a.type)).toEqual(['startPushToTalkRecording','cancelPushToTalkRecording']);
});
it('Send Now remains available after speech ends and dispatches its semantic action',()=>{
 const{store,actions}=control({mode:'conversation',status:'recording',vadState:{isSpeaking:false,silenceDuration:500,autoSendThreshold:1500}});const node=target();const component=mount(ConversationModePanel,{target:node,props:{store}});cleanups.push(()=>{void unmount(component);});flushSync();const button=node.querySelector<HTMLButtonElement>('.send-button')!;
 expect(button.disabled).toBe(false);button.click();expect(actions).toEqual([{type:'manualSendRequested'}]);
});
it('timer re-arms after completed duration when start and duration change; unmount clears interval',()=>{
 vi.useFakeTimers();vi.setSystemTime(10000);const onMax=vi.fn();const node=target();const component=mount(RecordingTimerHarness,{target:node,props:{onMax}});flushSync();vi.advanceTimersByTime(1000);flushSync();expect(onMax).toHaveBeenCalledTimes(1);
 component.reset(Date.now(),2);flushSync();expect(node.textContent).toContain('0:00');vi.advanceTimersByTime(1000);flushSync();expect(node.textContent).toContain('0:01');expect(onMax).toHaveBeenCalledTimes(1);vi.advanceTimersByTime(1000);flushSync();expect(onMax).toHaveBeenCalledTimes(2);
 component.reset(Date.now(),5);flushSync();void unmount(component);flushSync();vi.advanceTimersByTime(6000);expect(onMax).toHaveBeenCalledTimes(2);
});
it.each([{status:'recording' as const,isSpeaking:false,silenceDuration:0},{status:'processing' as const,isSpeaking:true,silenceDuration:500}])('Send Now rejects empty or processing recordings: %j',initial=>{
 const{store,actions}=control({mode:'conversation',status:initial.status,vadState:{isSpeaking:initial.isSpeaking,silenceDuration:initial.silenceDuration,autoSendThreshold:1500}});const node=target();const component=mount(ConversationModePanel,{target:node,props:{store}});cleanups.push(()=>{void unmount(component);});flushSync();const button=node.querySelector<HTMLButtonElement>('.send-button')!;expect(button.disabled).toBe(true);button.click();expect(actions).toEqual([]);
});
it('unmount retires a keyboard hold waiting for permission',async()=>{
 const{store,actions}=control({},true);const node=target();const component=mount(VoiceInputButton,{target:node,props:{store}});flushSync();key(node.querySelector('button')!,'keydown',' ');await unmount(component);expect(actions.map(a=>a.type)).toEqual(['startPushToTalkRecording','cancelPushToTalkRecording']);
});
it('keyboard hold executes recorder and transcription through the production reducer',async()=>{
 const {voiceInputReducer}=await import('../src/lib/voice-input/reducer');
 const blob=new Blob(['recording']);const device={startRecording:vi.fn(),stopRecording:vi.fn(async()=>blob),startAudioLevelMonitoring:()=>1,stopInterval:()=>{},cleanup:()=>{},detectVoiceActivity:()=>false,requestMicrophone:async()=>{}};
 const transcribe=vi.fn(async(_audio:Blob)=> 'hello');
 const store=createStore<VoiceInputState,VoiceInputAction>({initialState:{...createInitialVoiceInputState(),permission:'granted',_audioManagerId:'test'},reducer:voiceInputReducer,dependencies:{getAudioManager:()=>device,createAudioManager:()=>device,transcribeAudio:transcribe}});
 const node=target();const component=mount(VoiceInputButton,{target:node,props:{store}});flushSync();const button=node.querySelector('button')!;key(button,'keydown','Enter');expect(device.startRecording).toHaveBeenCalledTimes(1);key(button,'keyup','Enter');await vi.waitFor(()=>expect(transcribe).toHaveBeenCalled());expect(device.stopRecording).toHaveBeenCalledTimes(1);expect(transcribe.mock.calls[0]?.[0]).toBe(blob);await unmount(component);store.destroy();
});
it('production start enters permission state before keydown returns, so immediate release cancels',async()=>{
 const{voiceInputReducer}=await import('../src/lib/voice-input/reducer');let resolvePermission!:()=>void;
 const device={startRecording:vi.fn(),stopRecording:async()=>new Blob(),startAudioLevelMonitoring:()=>1,stopInterval:()=>{},cleanup:()=>{},detectVoiceActivity:()=>false,requestMicrophone:()=>new Promise<void>(resolve=>{resolvePermission=resolve;})};
 const actions:VoiceInputAction[]=[];const store=createStore<VoiceInputState,VoiceInputAction>({initialState:createInitialVoiceInputState(),reducer:voiceInputReducer,dependencies:{getAudioManager:()=>device,createAudioManager:()=>device,transcribeAudio:async()=>''}});const unsubscribe=store.subscribeToActions?.(action=>actions.push(action));const node=target();const component=mount(VoiceInputButton,{target:node,props:{store}});flushSync();const button=node.querySelector('button')!;
 key(button,'keydown',' ');expect(store.state.status).toBe('requesting-permission');key(button,'keyup',' ');expect(actions.some(action=>action.type==='cancelPushToTalkRecording')).toBe(true);await unmount(component);unsubscribe?.();store.destroy();resolvePermission();await Promise.resolve();
});

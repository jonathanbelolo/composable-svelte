import {it,expect,vi,afterEach} from 'vitest';
import {render} from 'vitest-browser-svelte';
import {flushSync,tick,createRawSnippet} from 'svelte';
import {userEvent} from 'vitest/browser';
import {createStore} from '../src/lib/store.svelte.js';
import FileUpload from '../src/lib/components/ui/file-upload/FileUpload.svelte';
import DropdownMenu from '../src/lib/components/ui/dropdown-menu/DropdownMenu.svelte';
import {fileUploadReducer} from '../src/lib/components/ui/file-upload/file-upload.reducer.js';
import {createInitialFileUploadState,formatFileSize,type UploadedFile} from '../src/lib/components/ui/file-upload/file-upload.types.js';
import {dropdownMenuReducer} from '../src/lib/components/ui/dropdown-menu/dropdown-menu.reducer.js';
import {createInitialDropdownMenuState} from '../src/lib/components/ui/dropdown-menu/dropdown-menu.types.js';
import {animateDropdownIn,animateDropdownOut} from '../src/lib/animation/animate.js';
afterEach(()=>vi.restoreAllMocks());
const file=()=>new File(['abc'],'file.png',{type:'image/png'});
const drop=(root:HTMLElement,files:File[])=>{const dt=new DataTransfer();for(const f of files)dt.items.add(f);flushSync(()=>root.querySelector('[role="button"]')!.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:dt})));};
const items=[{id:'a',label:'Alpha'},{id:'b',label:'Beta'}];
const children=createRawSnippet(()=>({render:()=>'<span>Actions</span>'}));
it.each(['remove','clear','destroy'] as const)('aborts upload and gates late progress after %s',async kind=>{
 let signal:AbortSignal|undefined,progress!:(n:number)=>void,resolve!:()=>void;
 const store=createStore({initialState:createInitialFileUploadState(),reducer:fileUploadReducer,dependencies:{onUpload:(_file:File,p:(n:number)=>void,s?:AbortSignal)=>{signal=s;progress=p;return new Promise<void>(r=>{resolve=r;});}}});
 store.dispatch({type:'filesSelected',files:[file()]});expect(store.state.isUploading).toBe(true);
 if(kind==='remove')store.dispatch({type:'fileRemoved',fileId:store.state.files[0]!.id});else if(kind==='clear')store.dispatch({type:'allFilesCleared'});else store.destroy();
 expect(signal?.aborted).toBe(true);progress(40);resolve();await tick();store.destroy();
});
it('callback snapshots cannot mutate live file state and empty operations are silent',()=>{
 const changed=vi.fn((files:UploadedFile[])=>{if(files[0])files[0].status='error';});
 const store=createStore({initialState:createInitialFileUploadState(),reducer:fileUploadReducer,dependencies:{onFilesChange:changed}});
 store.dispatch({type:'filesSelected',files:[file()]});expect(store.state.files[0]!.status).toBe('pending');changed.mockClear();store.dispatch({type:'fileRemoved',fileId:'missing'});expect(changed).not.toHaveBeenCalled();
 store.dispatch({type:'allFilesCleared'});changed.mockClear();store.dispatch({type:'allFilesCleared'});expect(changed).not.toHaveBeenCalled();store.destroy();
});
it('validates files before spending count slots and formats large bounds',()=>{
 const store=createStore({initialState:createInitialFileUploadState(),reducer:fileUploadReducer,dependencies:{validation:{maxFiles:2,maxSize:5}}});
 store.dispatch({type:'filesSelected',files:[new File(['too large'],'large.txt'),new File(['x'],'one.txt'),new File(['x'],'two.txt')]});
 expect(store.state.files.map(f=>f.file.name)).toEqual(['one.txt','two.txt']);expect(store.state.errors.map(e=>e.type)).toEqual(['max-size']);expect(formatFileSize(2**40)).toBe('1 TB');store.destroy();
});
it('preview opt-out acquires no URLs and disabled/errors are accessible',()=>{
 const create=vi.spyOn(URL,'createObjectURL');const view=render(FileUpload,{showPreviews:false});drop(view.container,[file()]);expect(create).not.toHaveBeenCalled();
 const disabled=render(FileUpload,{disabled:true});expect(disabled.container.querySelector('[role="button"]')!.getAttribute('aria-disabled')).toBe('true');drop(disabled.container,[file()]);expect(disabled.container.textContent).not.toContain('file.png');
 const zero=render(FileUpload,{maxFiles:0});drop(zero.container,[file()]);expect(zero.container.querySelector('[role="alert"]')!.textContent).toContain('Cannot upload more than 0 files');expect(zero.container.querySelector('img')).toBeNull();
});
it('reports bounded live upload progress and completion, aborting on unmount',async()=>{
 let progress!:(n:number)=>void,resolve!:()=>void,signal:AbortSignal|undefined;
 const view=render(FileUpload,{onUpload:(_f,p,s)=>{progress=p;signal=s;return new Promise<void>(r=>{resolve=r;});}});drop(view.container,[file()]);
 for(const [sent,shown]of [[40,40],[150,100],[-5,0]]){flushSync(()=>progress(sent!));expect(view.container.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe(String(shown));}
 expect(view.container.querySelector<HTMLButtonElement>('[aria-label="Clear all files"]')!.disabled).toBe(true);resolve();await tick();flushSync();expect(view.container.querySelector('[role="progressbar"]')).toBeNull();progress(20);await tick();expect(view.container.querySelector('[role="progressbar"]')).toBeNull();
 drop(view.container,[file()]);view.unmount();expect(signal?.aborted).toBe(true);progress(50);resolve();await tick();
});
it('uses one native trigger and restores focus after clicking blank background',async()=>{
 const view=render(DropdownMenu,{items,children});const trigger=view.container.querySelector('[aria-haspopup="menu"]')!;expect(trigger.tagName).toBe('BUTTON');
 await userEvent.click(trigger);expect(document.activeElement?.getAttribute('role')).toBe('menu');
 const blank=document.createElement('div');blank.textContent='blank';document.body.append(blank);await userEvent.click(blank);expect(document.activeElement).toBe(trigger);blank.remove();
});
it('guards stale transition events and permits headless optional dependencies',()=>{
 const initial=createInitialDropdownMenuState(items);
 const [open]=dropdownMenuReducer(initial,{type:'opened'},undefined as never);
 expect(dropdownMenuReducer(open,{type:'presentation',event:{type:'dismissalCompleted'}},undefined as never)[0]).toBe(open);
 const [closed]=dropdownMenuReducer(open,{type:'closed'},undefined as never);
 expect(dropdownMenuReducer(closed,{type:'presentation',event:{type:'presentationCompleted'}},undefined as never)[0]).toBe(closed);
 expect(()=>dropdownMenuReducer(open,{type:'itemSelected',index:0},undefined as never)).not.toThrow();
});
it('settles owner-cancelled playback and reduced motion without active animation',async()=>{
 const el=document.createElement('div');document.body.append(el);const abort=new AbortController();const playback=animateDropdownIn(el,abort.signal);abort.abort();await playback;
 vi.spyOn(window,'matchMedia').mockReturnValue({matches:true} as MediaQueryList);
 await animateDropdownIn(el);expect(el.style.opacity).toBe('1');await animateDropdownOut(el);expect(el.style.opacity).toBe('0');el.remove();
});
it('a rejected upload reports the owned error and a missing handler skips work cleanly',async()=>{
 const view=render(FileUpload,{onUpload:async()=>{throw Error('network unavailable');}});drop(view.container,[file()]);await tick();flushSync();expect(view.container.textContent).toContain('network unavailable');expect(view.container.querySelector('[role="progressbar"]')).toBeNull();
 let upload:((file:File)=>Promise<void>)|undefined=vi.fn(async()=>{});
 const store=createStore({initialState:createInitialFileUploadState(),reducer:fileUploadReducer,dependencies:{get onUpload(){return upload;},onFilesChange(){upload=undefined;}}});store.dispatch({type:'filesSelected',files:[file()]});expect(store.state.files[0]!.status).toBe('pending');expect(store.state.files[0]!.error).toBeUndefined();store.destroy();
});
it('moves the active command into the visible menu area',async()=>{
 const scroll=vi.spyOn(HTMLElement.prototype,'scrollIntoView');const view=render(DropdownMenu,{items,children});const trigger=view.container.querySelector<HTMLElement>('[aria-haspopup="menu"]')!;
 await userEvent.click(trigger);await userEvent.keyboard('{ArrowDown}{ArrowDown}');expect(scroll).toHaveBeenCalledWith({block:'nearest'});expect((scroll.mock.contexts.at(-1) as HTMLElement | undefined)?.textContent).toContain('Beta');
});

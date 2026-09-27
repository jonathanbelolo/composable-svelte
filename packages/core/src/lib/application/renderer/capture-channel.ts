import {MotionChannel,type MotionRunContext} from './motion-run.js';
import {captureHTML} from './capture-html.js';
import {captureHasPropertyAuthority,type TargetRegistry} from './target-registry.js';
import type {ResourceRecord} from '../../execution/resources.js';
/** One declared outlet placement; visual resources belong to its renderer host. */
export class CaptureChannel {
 private readonly record:ResourceRecord;private readonly motion:MotionChannel;private readonly targets=new Map<object,()=>HTMLElement|undefined>();
 private ready:(()=>void)|undefined;private layer:HTMLElement|undefined;
 constructor(private readonly registry:TargetRegistry){
  this.record=registry.visualRecord();
  this.motion=new MotionChannel(
    this.record,
    this.registry.clock,
    error=>this.registry.observeCleanup(()=>{throw error;}),
    cleanup=>this.registry.observeCleanup(cleanup)
  );
  this.record.addCleanup(()=>{this.ready=undefined;this.targets.clear();this.layer?.remove();this.layer=undefined;});
 }
 get visualRecord():ResourceRecord{return this.record;}
 register(owner:object,surface:()=>HTMLElement|undefined):()=>void{if(!this.record.live)return()=>{};if(this.targets.has(owner))throw new Error('Duplicate outgoing owner registration');this.targets.set(owner,surface);return()=>{if(this.targets.get(owner)===surface)this.targets.delete(owner);};}
 prepare(next:readonly object[],claimed?:(owner:object)=>boolean):void{
  if(!this.record.live||!this.registry.isAttached)return;
  // Owners claimed by a running route choreography get their removal visuals from it (no double paint).
  const live=new Set(next);const outgoing=[...this.targets].filter(([owner])=>!live.has(owner)&&!claimed?.(owner));if(!outgoing.length)return;
  const snapshots:HTMLDivElement[]=[];
  for(const [,surface] of outgoing){
    const node=surface();
    if(!node||captureHasPropertyAuthority(node)||snapshots.length>=8)continue;
    const capture=captureHTML(node);
    if(capture.kind==='captured'){snapshots.push(capture.node);}
  }
  const stable=()=>{for(const snapshot of snapshots)snapshot.remove();if(this.layer&&!this.layer.childNodes.length){this.layer.remove();this.layer=undefined;}};
  if(!snapshots.length){stable();return;}
  const docs=new Set(snapshots.map(s=>s.ownerDocument));
  if(docs.size>1){
    stable();
    this.registry.observeCleanup(()=>{throw new Error('Mixed-document capture is unsupported');});
    return;
  }
  const doc=snapshots[0]!.ownerDocument;
  const win=doc.defaultView;
  if(!win){stable();return;}
  if(this.registry.preferences.reduced(snapshots)){
    this.motion.start({deadlineMs:300,skip:'reducedMotion',execute(){},stable});
    return;
  }
  this.motion.start({
    deadlineMs:300,
    stable,
    execute:context=>{
      context.adopt(stable);
      const unwatch=this.registry.preferences.watch(snapshots,()=>{
        if(context.live){
          this.motion.start({deadlineMs:300,skip:'reducedMotion',execute(){},stable},'preferenceChanged');
        }
      });
      context.adopt(unwatch);
      if(!context.live)return;
      return new Promise<void>((resolve,reject)=>{
        const begin=()=>{
          if(!context.live)return;
          try{
            if(this.layer&&this.layer.ownerDocument!==doc){
              this.layer.remove();
              this.layer=undefined;
            }
            const layer=this.layer??=doc.createElement('div');
            layer.inert=true;layer.setAttribute('aria-hidden','true');layer.style.pointerEvents='none';
            if(!layer.isConnected)doc.body.appendChild(layer);
            for(const snapshot of snapshots)layer.appendChild(snapshot);
            const completions:Promise<Animation>[]=[];
            for(const snapshot of snapshots){
              if(!context.live)return;
              const animation=snapshot.animate([{opacity:1},{opacity:0}],{duration:120,easing:'ease-out',fill:'both'});
              context.adopt(()=>animation.cancel());
              const finished=animation.finished;void finished.catch(()=>{});completions.push(finished);
            }
            if(!context.live)return;
            void Promise.all(completions).then(()=>resolve(),reject);
          }catch(error){reject(error);}
        };
        this.ready=begin;
        context.adopt(()=>{if(this.ready===begin)this.ready=undefined;});
      });
    }
  });
 }
 rendered():void{const ready=this.ready;this.ready=undefined;ready?.();}
 dispose():void{this.record.dispose();}
}

import type {StoreExecutionConfig} from '../src/lib/types.js';
type S={route:string};type A={type:'boot';route:string};type D={suffix:string};
const literal:StoreExecutionConfig<S,A,D>={mode:'managed',_initialization:{mode:'attached',startup:{type:'boot',route:'/literal'}}};
const decision:StoreExecutionConfig<S,A,D>={mode:'managed',_initialization:{mode:'attached',startupDecision:(state,deps)=>({type:'boot',route:state.route+deps.suffix})}};
const empty:StoreExecutionConfig<S,A,D>={mode:'managed',_initialization:{mode:'attached',startupDecision:()=>undefined}};
// @ts-expect-error Literal action and lazy decision are mutually exclusive.
const mixed:StoreExecutionConfig<S,A,D>={mode:'managed',_initialization:{mode:'attached',startup:{type:'boot',route:'/'},startupDecision:()=>({type:'boot',route:'/'})}};
// @ts-expect-error The factory must return the declared root action domain.
const invalid:StoreExecutionConfig<S,A,D>={mode:'managed',_initialization:{mode:'attached',startupDecision:()=>({type:'other'})}};
void [literal,decision,empty,mixed,invalid];

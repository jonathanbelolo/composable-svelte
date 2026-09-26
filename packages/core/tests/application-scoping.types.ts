import {scopeTo,type ApplicationStore} from '../src/lib/application/index.js';
import {nestedEditor,workspaceSlot,type Root,type Action} from './fixtures/ApplicationNestedModel.js';
declare const app:ApplicationStore<Root,Action>;
const leaf=scopeTo(app,nestedEditor);leaf?.dispatch({type:'increment'});
// @ts-expect-error wrong child action
leaf?.dispatch({type:'close'});
// @ts-expect-error no destroy on child
leaf?.destroy();
// @ts-expect-error no history on root
app.history;
// @ts-expect-error narrow facade cannot enter legacy dynamic path
scopeTo(app).into('workspace');
declare const unrelated:ApplicationStore<{count:number},{type:'increment'}>;
// @ts-expect-error wrong root state/action schema
scopeTo(unrelated,workspaceSlot);

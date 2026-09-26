import { describe, it, expect, vi } from 'vitest';
import { TestStore } from '../src/lib/test/test-store.js';
import { treeViewReducer } from '../src/lib/components/ui/tree-view/tree-view.reducer.js';
import { createInitialTreeViewState, type TreeNode } from '../src/lib/components/ui/tree-view/tree-view.types.js';

describe('lazy tree keyboard expansion', () => {
  for (const children of [undefined, []] as const) {
    it(`loads an unexpanded lazy node with ${children === undefined ? 'missing' : 'empty'} children`, async () => {
      let finish!: (nodes: TreeNode[]) => void;
      const loaded = new Promise<TreeNode[]>(resolve => { finish = resolve; });
      const loadChildren = vi.fn(() => loaded);
      const node: TreeNode = {id:'remote',label:'Remote',lazy:true,...(children ? {children:[...children]} : {})};
      const store = new TestStore({initialState:{...createInitialTreeViewState([node]),highlightedId:'remote'},reducer:treeViewReducer,dependencies:{loadChildren}});
      try {
        await store.send({type:'arrowRight'}, state => { expect(state.expandedIds.has('remote')).toBe(true); expect(state.loadingIds.has('remote')).toBe(true); });
        await store.receive({type:'childrenLoadingStarted',nodeId:'remote'});
        expect(loadChildren).toHaveBeenCalledExactlyOnceWith('remote',node);
        await store.send({type:'arrowRight'});
        expect(loadChildren).toHaveBeenCalledTimes(1);
        finish([{id:'child',label:'Child'}]);
        await store.receive({type:'childrenLoaded',nodeId:'remote',children:[{id:'child',label:'Child'}]}, state => {expect(state.loadingIds.size).toBe(0);});
        await store.send({type:'arrowRight'}, state => {expect(state.highlightedId).toBe('child');});
      } finally { finish([]); store.destroy(); }
    });
  }
  it('does not expand or fetch a leaf', async () => {
    const loadChildren=vi.fn(async () => []);
    const store=new TestStore({initialState:{...createInitialTreeViewState([{id:'leaf',label:'Leaf'}]),highlightedId:'leaf'},reducer:treeViewReducer,dependencies:{loadChildren}});
    await store.send({type:'arrowRight'},state=>{expect(state.expandedIds.size).toBe(0);expect(state.loadingIds.size).toBe(0);});
    expect(loadChildren).not.toHaveBeenCalled(); store.destroy();
  });
});

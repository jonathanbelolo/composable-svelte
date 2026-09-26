import {defineViews} from '../../src/lib/application/index.js';
import {composition,workspaceComposition} from './FeatureViewsModel.js';
import Leaf from './FeatureViewsLeaf.svelte';
import Workspace from './FeatureViewsWorkspace.svelte';
export const workspaceViews=defineViews(workspaceComposition,{editor:{render:Leaf}});
export const rootViews=defineViews(composition,{workspace:{render:Workspace,children:workspaceViews},worker:{headless:true},rows:{render:Leaf}});

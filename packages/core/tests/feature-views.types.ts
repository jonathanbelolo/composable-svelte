import {defineViews,type FeatureViewProps,FeatureOutlet} from '../src/lib/application/index.js';
import type {Component} from 'svelte';
import {composition,workspaceComposition,type Leaf,type LA} from './fixtures/FeatureViewsModel.js';
import {workspaceViews,rootViews} from './fixtures/FeatureViewsPlans.js';
import LeafComponent from './fixtures/FeatureViewsLeaf.svelte';
import Workspace from './fixtures/FeatureViewsWorkspace.svelte';
// @ts-expect-error every composed slot must be classified
defineViews(composition,{workspace:{render:Workspace,children:workspaceViews},rows:{render:LeafComponent}});
// @ts-expect-error typo cannot substitute for the declared worker token
defineViews(composition,{workspace:{render:Workspace,children:workspaceViews},workre:{headless:true},rows:{render:LeafComponent}});
// @ts-expect-error nested managed composition requires its own exhaustive map
defineViews(composition,{workspace:{render:Workspace},worker:{headless:true},rows:{render:LeafComponent}});
declare const wrong:Component<FeatureViewProps<Leaf,{type:'wrong'}>>;
// @ts-expect-error incompatible child actions cannot be passed into component
defineViews(workspaceComposition,{editor:{render:wrong}});
// @ts-expect-error cannot both render and intentionally omit
defineViews(workspaceComposition,{editor:{render:LeafComponent,headless:true}});
const unrendered=defineViews(composition,{workspace:{headless:true},worker:{headless:true},rows:{headless:true}});
void rootViews;void unrendered;void FeatureOutlet;
// @ts-expect-error root view plan is not the workspace child's plan
defineViews(composition,{workspace:{render:Workspace,children:rootViews},worker:{headless:true},rows:{render:LeafComponent}});

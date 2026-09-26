<script lang="ts">
import { setContext } from 'svelte';
import {
  ApplicationRoot,
  ApplicationHost,
  FeatureViews,
  FeatureOutlet,
  type ApplicationInstance,
  type ChildView
} from '@composable-svelte/core/application';
import {
  graphicsAppDefinition,
  type AppState,
  type AppAction
} from './managed-graphics-recipe-model.js';
import { graphicsViews } from './managed-graphics-recipe-views.js';
import type { GraphicsState, GraphicsAction } from '../../src/core/types.js';
import type { GraphicsAdapter } from '../../src/core/scene-sync.js';
import { BabylonAdapter } from '../../src/adapters/babylon-adapter.js';

let {
  adapter,
  sidebarAdapter,
  onCaptureScene,
  onCaptureSidebar,
  showDeclarativeChildren = false,
  showOverlay = false,
  onApp
}: {
  adapter?: GraphicsAdapter | (() => GraphicsAdapter | undefined) | undefined;
  sidebarAdapter?: GraphicsAdapter | (() => GraphicsAdapter | undefined) | undefined;
  onCaptureScene?: ((view: ChildView<GraphicsState, GraphicsAction>) => void) | undefined;
  onCaptureSidebar?: ((view: ChildView<GraphicsState, GraphicsAction>) => void) | undefined;
  showDeclarativeChildren?: boolean | undefined;
  showOverlay?: boolean | undefined;
  onApp?: ((app: ApplicationInstance<AppState, AppAction>) => void) | undefined;
} = $props();

const resolveAdapter = (): GraphicsAdapter => (typeof adapter === 'function' ? adapter() : adapter) ?? new BabylonAdapter();
const resolveSidebarAdapter = (): GraphicsAdapter => (typeof sidebarAdapter === 'function' ? sidebarAdapter() : sidebarAdapter) ?? new BabylonAdapter();

setContext('getGraphicsAdapter', resolveAdapter);
setContext('getSidebarAdapter', resolveSidebarAdapter);
setContext('onCaptureScene', onCaptureScene);
setContext('onCaptureSidebar', onCaptureSidebar);
setContext('showDeclarativeChildren', showDeclarativeChildren);
setContext('showOverlay', showOverlay);
</script>

<ApplicationRoot definition={graphicsAppDefinition} options={{ dependencies: {}, initial: { input: undefined } }}>
  {#snippet children(app)}
    {@const _ = onApp?.(app)}
    <ApplicationHost {app}>
      <FeatureViews store={app.store} definition={graphicsViews}>
        {#snippet children(views)}
          <main data-testid="scene-outlet">
            <FeatureOutlet view={views.scene} />
          </main>
          <aside data-testid="sidebar-outlet">
            <FeatureOutlet view={views.sidebarScene} />
          </aside>
        {/snippet}
      </FeatureViews>
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>

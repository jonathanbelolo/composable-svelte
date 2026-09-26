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
  mapAppDefinition,
  type AppState,
  type AppAction
} from './managed-map-recipe-model.js';
import { mapViews } from './managed-map-recipe-views.js';
import type { MapAdapter, MapState, MapAction } from '../../src/lib/types/map.types.js';

let {
  adapter,
  sidebarAdapter,
  onCaptureMap,
  onCaptureSidebar,
  showDeclarativeControls = false,
  onApp
}: {
  adapter?: MapAdapter | (() => MapAdapter | undefined) | undefined;
  sidebarAdapter?: MapAdapter | (() => MapAdapter | undefined) | undefined;
  onCaptureMap?: ((view: ChildView<MapState, MapAction>) => void) | undefined;
  onCaptureSidebar?: ((view: ChildView<MapState, MapAction>) => void) | undefined;
  showDeclarativeControls?: boolean | undefined;
  onApp?: ((app: ApplicationInstance<AppState, AppAction>) => void) | undefined;
} = $props();

const resolveAdapter = () => typeof adapter === 'function' ? adapter() : adapter;
const resolveSidebarAdapter = () => typeof sidebarAdapter === 'function' ? sidebarAdapter() : sidebarAdapter;

setContext('getMapAdapter', resolveAdapter);
setContext('getSidebarAdapter', resolveSidebarAdapter);
setContext('onCaptureMap', onCaptureMap);
setContext('onCaptureSidebar', onCaptureSidebar);
setContext('showDeclarativeControls', showDeclarativeControls);
</script>

<ApplicationRoot definition={mapAppDefinition} options={{ dependencies: {}, initial: { input: undefined } }}>
  {#snippet children(app)}
    {@const _ = onApp?.(app)}
    <ApplicationHost {app}>
      <FeatureViews store={app.store} definition={mapViews}>
        {#snippet children(views)}
          <main data-testid="map-outlet">
            <FeatureOutlet view={views.map} />
          </main>
          <aside data-testid="sidebar-outlet">
            <FeatureOutlet view={views.sidebarMap} />
          </aside>
        {/snippet}
      </FeatureViews>
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>

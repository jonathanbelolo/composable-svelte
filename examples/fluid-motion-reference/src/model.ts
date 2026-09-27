/**
 * Horizon Gallery — domain, composition and routing.
 *
 * Pure state and reducers composed with the public managed-integration API. The page slot is the
 * staged route slot: route changes are explicit `navigate` actions committed by the framework at
 * the choreography cue. View components are bound separately in views.ts so this module stays
 * importable by Node tests without a Svelte compiler.
 */
import { Effect, type Reducer, createDestination, type PresentationAction } from '@composable-svelte/core';
import {
  defineApplication,
  destinationSlot,
  optionalSlot,
  ManagedIntegrationBuilder,
  type ApplicationRouting
} from '@composable-svelte/core/application';
import { fluidMotion } from '@composable-svelte/core/application/motion';
import {
  createInitialGraphicsState,
  graphicsReducer,
  graphicsVisualProvider,
  type AnimationConfig,
  type GraphicsAction,
  type GraphicsState
} from '@composable-svelte/graphics';

/* Catalog */

export type Category = 'all' | 'pneumatic' | 'kinetic';

export interface Work {
  readonly id: string;
  readonly title: string;
  readonly category: Exclude<Category, 'all'>;
  readonly label: string;
  readonly summary: string;
}

export const works: readonly Work[] = [
  {
    id: 'pavilion',
    title: 'Pavilion of Light & Atmosphere',
    category: 'pneumatic',
    label: 'Featured pavilion',
    summary: 'A double-curved tensile membrane that responds to diurnal temperature shifts and solar incidence.'
  },
  {
    id: 'lattice',
    title: 'Vascular Concrete Lattice',
    category: 'kinetic',
    label: 'Prototype',
    summary: 'Concrete ribs threaded with capillary cooling loops for passive climate damping.'
  },
  {
    id: 'origami',
    title: 'Acoustic Origami Facade',
    category: 'kinetic',
    label: 'Theoretical',
    summary: 'Parametric folding tiles tuned for urban noise diffusion and seasonal ventilation.'
  },
  {
    id: 'cloud',
    title: 'Inflatable Reading Cloud',
    category: 'pneumatic',
    label: 'Built 2019',
    summary: 'A translucent ETFE canopy that inflates over a public library courtyard on rainy afternoons.'
  }
];

/* Home */

export type HomeLayout = 'gallery' | 'reading';

export interface HomePageState {
  readonly category: Category;
  /** Work shown first in the grid. */
  readonly featured: string;
  readonly layout: HomeLayout;
  readonly applause: number;
}

export type HomePageAction =
  | { readonly type: 'setCategory'; readonly category: Category }
  | { readonly type: 'feature'; readonly id: string }
  | { readonly type: 'setLayout'; readonly layout: HomeLayout }
  | { readonly type: 'applaud' };

export const homeReducer: Reducer<HomePageState, HomePageAction> = (state, action) => {
  switch (action.type) {
    case 'setCategory':
      return [{ ...state, category: action.category }, Effect.none()];
    case 'feature':
      return [{ ...state, featured: action.id }, Effect.none()];
    case 'setLayout':
      return [{ ...state, layout: action.layout }, Effect.none()];
    case 'applaud':
      return [{ ...state, applause: state.applause + 1 }, Effect.none()];
  }
};

/** Works visible in the grid, featured work first. */
export function visibleWorks(state: HomePageState): readonly Work[] {
  const shown = works.filter(work => state.category === 'all' || work.category === state.category);
  return [...shown.filter(work => work.id === state.featured), ...shown.filter(work => work.id !== state.featured)];
}

/* Dossier */

export type DossierTab = 'overview' | 'structure' | 'commentary';

export interface DetailPageState {
  readonly tab: DossierTab;
  readonly bookmarked: boolean;
  /** Playback of the muted airflow-study loop; the visitor can pause it. */
  readonly airflow: 'playing' | 'paused';
}

export type DetailPageAction =
  | { readonly type: 'setTab'; readonly tab: DossierTab }
  | { readonly type: 'toggleBookmark' }
  | { readonly type: 'toggleAirflow' };

export const detailReducer: Reducer<DetailPageState, DetailPageAction> = (state, action) => {
  switch (action.type) {
    case 'setTab':
      return [{ ...state, tab: action.tab }, Effect.none()];
    case 'toggleBookmark':
      return [{ ...state, bookmarked: !state.bookmarked }, Effect.none()];
    case 'toggleAirflow':
      return [{ ...state, airflow: state.airflow === 'playing' ? 'paused' : 'playing' }, Effect.none()];
  }
};

/* Study (the real expanded card state) */

export type Zoom = 1 | 1.5 | 2;

export interface StudyPageState {
  readonly id: string;
  readonly zoom: Zoom;
  readonly overlays: { readonly stress: boolean; readonly solar: boolean };
  readonly notes: string;
  readonly saved: boolean;
}

export type StudyPageAction =
  | { readonly type: 'setZoom'; readonly zoom: Zoom }
  | { readonly type: 'toggleOverlay'; readonly overlay: 'stress' | 'solar' }
  | { readonly type: 'editNotes'; readonly notes: string }
  | { readonly type: 'save' };

export const studyReducer: Reducer<StudyPageState, StudyPageAction> = (state, action) => {
  switch (action.type) {
    case 'setZoom':
      return [{ ...state, zoom: action.zoom }, Effect.none()];
    case 'toggleOverlay':
      return [{ ...state, overlays: { ...state.overlays, [action.overlay]: !state.overlays[action.overlay] } }, Effect.none()];
    case 'editNotes':
      return [{ ...state, notes: action.notes, saved: false }, Effect.none()];
    case 'save':
      return [{ ...state, saved: true }, Effect.none()];
  }
};

/* Pavilion model (one shared 3D scene) */

/**
 * The pavilion model is application state at the root, not page state: the home card and the study both
 * render this one scene, so the turntable's playback (animation start time, loop) continues across the route
 * commit because both pages read the same explicit state. Nothing is reset and nothing is seeded implicitly.
 */
const pavilionScene: GraphicsState = {
  ...createInitialGraphicsState({ sceneId: 'pavilion-model', backgroundColor: '#0f1522' }),
  camera: { type: 'perspective', position: [0, 3.2, 7.5], lookAt: [0, 0.6, 0], fov: 40, near: 0.1, far: 100 },
  lights: [
    { id: 'sky', type: 'ambient', intensity: 0.55, color: '#dbeafe' },
    { id: 'sun', type: 'directional', direction: [-0.6, -1, -0.4], intensity: 1.1, color: '#fde68a' }
  ],
  meshes: [
    { id: 'plinth', geometry: { type: 'cylinder', height: 0.25, diameter: 5 }, material: { color: '#1e293b', roughness: 0.9 }, position: [0, -0.125, 0] },
    { id: 'membrane', geometry: { type: 'torus', diameter: 3.4, thickness: 0.5, segments: 48 }, material: { color: '#38bdf8', metallic: 0.2, roughness: 0.35, alpha: 0.85 }, position: [0, 1.1, 0], rotation: [Math.PI / 2.4, 0, 0] },
    { id: 'mast', geometry: { type: 'cylinder', height: 2.6, diameter: 0.12 }, material: { color: '#f59e0b', emissive: '#7c2d12' }, position: [0, 1.3, 0] }
  ]
};

/** The visitor's turntable: one looping rotation of the membrane every 9 s. */
export const turntable: AnimationConfig = {
  id: 'turntable',
  targetId: 'membrane',
  property: 'rotation',
  from: [Math.PI / 2.4, 0, 0],
  to: [Math.PI / 2.4, Math.PI * 2, 0],
  duration: 9000,
  easing: 'linear',
  loop: true
};

export const isTurning = (scene: GraphicsState | null | undefined) => !!scene?.animations.some(entry => entry.id === turntable.id && entry.isPlaying);

/* Pages and root */

export const pages = createDestination({
  home: homeReducer,
  detail: detailReducer,
  study: studyReducer
});

export type PagesState = typeof pages._types.State;
export type PagesAction = typeof pages._types.Action;

export type AppURL = '/' | '/dossier' | '/study';

export interface AppState {
  readonly url: AppURL;
  readonly page: PagesState | null;
  /** Visitor preference; combined with the OS setting when choosing a choreography. */
  readonly reducedMotion: boolean;
  /** The shared pavilion model, rendered by the home card and the study. */
  readonly scene: GraphicsState | null;
}

export type AppAction =
  | { readonly type: 'navigate'; readonly url: AppURL }
  | { readonly type: 'setReducedMotion'; readonly enabled: boolean }
  | { readonly type: 'page'; readonly action: PresentationAction<PagesAction> }
  | { readonly type: 'scene'; readonly action: PresentationAction<GraphicsAction> };

export interface AppDependencies {
  /** Optional observer of every domain action type (used by evidence tests; absent in production). */
  readonly trace?: string[];
  /** Optional observer of pavilion-model actions, kept apart because the turntable ticks every frame. */
  readonly sceneTrace?: string[];
}

export interface AppIntent { readonly to: AppURL }

export function normalizeURL(input: string): AppURL {
  const path = input.split(/[?#]/)[0];
  return path === '/dossier' || path === '/study' ? path : '/';
}

export function pageFor(url: AppURL, reducedMotion = false): PagesState {
  if (url === '/dossier') return pages.initial('detail', { tab: 'overview', bookmarked: false, airflow: reducedMotion ? 'paused' : 'playing' });
  if (url === '/study') {
    return pages.initial('study', {
      id: 'pavilion',
      zoom: 1,
      overlays: { stress: true, solar: false },
      notes: '',
      saved: false
    });
  }
  return pages.initial('home', { category: 'all', featured: 'pavilion', layout: 'gallery', applause: 42 });
}

export function createInitialAppState(input = '/'): AppState {
  const url = normalizeURL(input);
  return { url, page: pageFor(url), reducedMotion: false, scene: pavilionScene };
}

function traceLabel(action: AppAction): string {
  if (action.type !== 'page') return action.type as string;
  const outer = action.action;
  return outer.type === 'presented' ? `${outer.action.type}:${outer.action.action.type}` : 'page:dismiss';
}

export const rootReducer: Reducer<AppState, AppAction, AppDependencies> = (state, action, deps) => {
  if (action.type === 'scene') deps.sceneTrace?.push(action.action.type === 'presented' ? action.action.action.type : 'dismiss');
  else deps.trace?.push(traceLabel(action));
  switch (action.type) {
    case 'navigate':
      return [{ ...state, url: action.url, page: pageFor(action.url, state.reducedMotion) }, Effect.none()];
    case 'setReducedMotion': {
      // Autoplaying motion stops as soon as the visitor asks for less motion, wherever they are. The dossier's
      // airflow loop pauses in state (they can still press Play). The turntable only turns when started, so it stays theirs.
      const page = action.enabled && state.page?.type === 'detail' ? { ...state.page, state: { ...state.page.state, airflow: 'paused' as const } } : state.page;
      return [{ ...state, reducedMotion: action.enabled, page }, Effect.none()];
    }
    case 'page':
    case 'scene':
      return [state, Effect.none()];
  }
};

export const pageSlot = destinationSlot<AppState, AppAction>()('page', pages);

export const sceneSlot = optionalSlot<AppState, AppAction>()('scene');

export const composition = new ManagedIntegrationBuilder(rootReducer)
  .with(pageSlot, { replaceOn: action => action.type === 'navigate' })
  .with(sceneSlot, graphicsReducer)
  .build();

export const appRouting: ApplicationRouting<AppState, AppAction, AppIntent> = {
  fragment: 'native',
  serialize: state => state.url,
  request: url => {
    const next = normalizeURL(url);
    return { action: { type: 'navigate', url: next }, expectedURL: next };
  },
  staging: {
    policy: () => true,
    commit: intent => ({ action: { type: 'navigate', url: intent.to }, expectedURL: intent.to }),
    routeSlot: pageSlot
  },
  // The reading list keeps its own scroll position across history traversal.
  scroll: { containers: ['reading-list'] }
};

export const applicationDefinition = defineApplication(composition, {
  initialState: (url: string) => createInitialAppState(url),
  routing: appRouting,
  // The first-party graphics provider represents the pavilion canvas; everything else uses the built-ins.
  visual: fluidMotion({ providers: [graphicsVisualProvider()] })
});

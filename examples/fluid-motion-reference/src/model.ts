/**
 * Horizon Gallery — domain, composition and routing.
 *
 * Pure state and reducers composed with the public managed-integration API. The page slot is the
 * staged route slot: route changes are explicit `navigate` actions committed by the framework at
 * the choreography cue. View components are bound separately in views.ts so this module stays
 * importable by Node tests without a Svelte compiler.
 */
import {
  Effect,
  type Reducer,
  createDestination,
  type PresentationAction
} from '@composable-svelte/core';
import {
  defineApplication,
  destinationSlot,
  optionalSlot,
  ManagedIntegrationBuilder,
  type ApplicationRouting
} from '@composable-svelte/core/application';
import { fluidMotion } from '@composable-svelte/core/application/motion';
import type { PresentationState, PresentationEvent } from '@composable-svelte/core/navigation';
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
  | { readonly type: 'applaud' }
  | { readonly type: 'openCurator'; readonly id: string }
  | { readonly type: 'openDrawer'; readonly id?: string };

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
    case 'openCurator':
    case 'openDrawer':
      return [state, Effect.none()];
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

/* Curator & Stacking Overlay Domain */

export interface CuratorSpec {
  readonly id: string;
  readonly title: string;
  readonly status: 'draft' | 'under_review' | 'certified';
  readonly curatorNotes: string;
  readonly membranePreload: string;
  readonly maxSpan: string;
  readonly lastSavedAt?: string;
}

export const defaultCuratorSpecs: Record<string, CuratorSpec> = {
  pavilion: {
    id: 'pavilion',
    title: 'Pavilion of Light & Atmosphere',
    status: 'certified',
    curatorNotes: 'Responsive tensile membrane with passive diurnal thermal regulation.',
    membranePreload: '4.8 kN/m',
    maxSpan: '38.4 m'
  },
  lattice: {
    id: 'lattice',
    title: 'Vascular Concrete Lattice',
    status: 'under_review',
    curatorNotes: 'Internal fluid circulation loops damp temperature spikes by 6.2K.',
    membranePreload: '12.4 kN/m',
    maxSpan: '22.0 m'
  },
  origami: {
    id: 'origami',
    title: 'Acoustic Origami Facade',
    status: 'draft',
    curatorNotes: 'Parametric tessellation dissipates street reverberation up to 14 dB.',
    membranePreload: '2.1 kN/m',
    maxSpan: '16.5 m'
  },
  cloud: {
    id: 'cloud',
    title: 'Inflatable Reading Cloud',
    status: 'certified',
    curatorNotes: 'Lightweight double-skin ETFE inflated at 250 Pa gauge pressure.',
    membranePreload: '1.9 kN/m',
    maxSpan: '28.0 m'
  }
};

export interface CuratorModalState {
  readonly spec: CuratorSpec;
  readonly initialNotes: string;
  readonly isDirty: boolean;
  readonly isSaving: boolean;
  readonly closeAfterSave: boolean;
  readonly instanceId: number;
  /** Message of the last failed save of this instance; cleared by the next save attempt. */
  readonly saveError: string | null;
  /**
   * Save & Close readiness: the request id of the successful save whose draft is still the saved revision. The view
   * commits the close for exactly this request (`commitSavedClose`); the commit consumes it. `null` when not ready.
   */
  readonly closeReady: number | null;
}

export type CuratorModalAction =
  | { readonly type: 'editNotes'; readonly notes: string }
  | { readonly type: 'save' }
  | { readonly type: 'saveAndClose' }
  | { readonly type: 'commitSavedClose'; readonly requestId: number };

export interface ConfirmAlertState {
  readonly workTitle: string;
}

export type ConfirmAlertAction =
  | { readonly type: 'keepEditing' }
  | { readonly type: 'confirmDiscard' };

export type DrawerTab = 'engineering' | 'acoustics' | 'sustainability';

export interface DrawerState {
  readonly workId: string;
  readonly tab: DrawerTab;
}

export type DrawerAction =
  | { readonly type: 'setTab'; readonly tab: DrawerTab };

/* Child Reducers for ManagedIntegrationBuilder */

export const curatorReducer: Reducer<CuratorModalState, CuratorModalAction, AppDependencies> = (state, action) => {
  switch (action.type) {
    case 'editNotes': {
      const isDirty = action.notes !== state.initialNotes;
      return [{ ...state, spec: { ...state.spec, curatorNotes: action.notes }, isDirty }, Effect.none()];
    }
    case 'save':
    case 'saveAndClose':
    case 'commitSavedClose':
      return [state, Effect.none()];
  }
};

export const confirmAlertReducer: Reducer<ConfirmAlertState, ConfirmAlertAction> = (state) => {
  return [state, Effect.none()];
};

export const drawerReducer: Reducer<DrawerState, DrawerAction> = (state, action) => {
  switch (action.type) {
    case 'setTab':
      return [{ ...state, tab: action.tab }, Effect.none()];
  }
};

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
  /** Modal presentation state and typed child state. */
  readonly curator: CuratorModalState | null;
  readonly curatorPresentation: PresentationState<CuratorModalState>;
  /** Nested discard confirmation alert state and presentation. */
  readonly confirmAlert: ConfirmAlertState | null;
  readonly confirmAlertPresentation: PresentationState<ConfirmAlertState>;
  /** Drawer presentation state and typed child state. */
  readonly drawer: DrawerState | null;
  readonly drawerPresentation: PresentationState<DrawerState>;
  /** Live specification catalog with saved curator revisions. */
  readonly specs: Record<string, CuratorSpec>;
  /** Per work, the request id of the latest save applied to `specs`: an older success never overwrites a newer one. */
  readonly catalogRevisions: Record<string, number>;
  readonly saveRequestId: number;
  readonly instanceCounter: number;
}

export type AppAction =
  | { readonly type: 'navigate'; readonly url: AppURL }
  | { readonly type: 'setReducedMotion'; readonly enabled: boolean }
  | { readonly type: 'page'; readonly action: PresentationAction<PagesAction> }
  | { readonly type: 'scene'; readonly action: PresentationAction<GraphicsAction> }
  | { readonly type: 'curator'; readonly action: PresentationAction<CuratorModalAction> }
  | { readonly type: 'confirmAlert'; readonly action: PresentationAction<ConfirmAlertAction> }
  | { readonly type: 'drawer'; readonly action: PresentationAction<DrawerAction> }
  | { readonly type: 'openCuratorModal'; readonly id: string }
  | { readonly type: 'closeCuratorModal' }
  | { readonly type: 'curatorPresentation'; readonly event: PresentationEvent }
  /** Business save results, owned by the root: handled whether or not the curator that started the save is still open. */
  | { readonly type: 'curatorSaveSucceeded'; readonly requestId: number; readonly instanceId: number; readonly spec: CuratorSpec }
  | { readonly type: 'curatorSaveFailed'; readonly requestId: number; readonly instanceId: number; readonly message: string }
  | { readonly type: 'confirmAlertPresentation'; readonly event: PresentationEvent }
  | { readonly type: 'openDrawer'; readonly id?: string | undefined }
  | { readonly type: 'closeDrawer' }
  | { readonly type: 'drawerPresentation'; readonly event: PresentationEvent };

export interface AppDependencies {
  /** Optional observer of every domain action type (used by evidence tests; absent in production). */
  readonly trace?: string[];
  /** Optional observer of pavilion-model actions, kept apart because the turntable ticks every frame. */
  readonly sceneTrace?: string[];
  /** Business async save operation; defaults to short simulated async latency. */
  readonly saveCuratorWork?: (id: string, notes: string) => Promise<void>;
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
  return {
    url,
    page: pageFor(url),
    reducedMotion: false,
    scene: pavilionScene,
    curator: null,
    curatorPresentation: { status: 'idle' },
    confirmAlert: null,
    confirmAlertPresentation: { status: 'idle' },
    drawer: null,
    drawerPresentation: { status: 'idle' },
    specs: { ...defaultCuratorSpecs },
    catalogRevisions: {},
    saveRequestId: 0,
    instanceCounter: 0
  };
}

function traceLabel(action: AppAction): string {
  if (action.type === 'page') {
    const outer = action.action;
    return outer.type === 'presented' ? `${outer.action.type}:${outer.action.action.type}` : 'page:dismiss';
  }
  if (action.type === 'curator') {
    const inner = action.action;
    return inner.type === 'presented' ? `curator:${inner.action.type}` : 'curator:dismiss';
  }
  if (action.type === 'confirmAlert') {
    const inner = action.action;
    return inner.type === 'presented' ? `confirmAlert:${inner.action.type}` : 'confirmAlert:dismiss';
  }
  if (action.type === 'drawer') {
    const inner = action.action;
    return inner.type === 'presented' ? `drawer:${inner.action.type}` : 'drawer:dismiss';
  }
  return action.type;
}

export const rootReducer: Reducer<AppState, AppAction, AppDependencies> = (state, action, deps) => {
  if (action.type === 'scene') deps.sceneTrace?.push(action.action.type === 'presented' ? action.action.action.type : 'dismiss');
  else deps.trace?.push(traceLabel(action));

  switch (action.type) {
    case 'navigate':
      return [{ ...state, url: action.url, page: pageFor(action.url, state.reducedMotion) }, Effect.none()];

    case 'setReducedMotion': {
      const page = action.enabled && state.page?.type === 'detail'
        ? { ...state.page, state: { ...state.page.state, airflow: 'paused' as const } }
        : state.page;
      return [{ ...state, reducedMotion: action.enabled, page }, Effect.none()];
    }

    case 'openCuratorModal': {
      const nextInstanceId = state.instanceCounter + 1;
      const spec = state.specs[action.id] ?? defaultCuratorSpecs[action.id] ?? defaultCuratorSpecs.pavilion!;
      const modalContent: CuratorModalState = {
        spec: { ...spec },
        initialNotes: spec.curatorNotes,
        isDirty: false,
        isSaving: false,
        closeAfterSave: false,
        instanceId: nextInstanceId,
        saveError: null,
        closeReady: null
      };
      return [
        {
          ...state,
          instanceCounter: nextInstanceId,
          curator: modalContent,
          curatorPresentation: { status: 'presenting', content: modalContent }
        },
        Effect.none()
      ];
    }

    case 'closeCuratorModal': {
      // Direct app action to close curator modal; delegates to the same guarded logic as curator dismiss
      return rootReducer(state, { type: 'curator', action: { type: 'dismiss' } }, deps);
    }

    case 'curator': {
      const inner = action.action;
      if (inner.type === 'dismiss') {
        if (!state.curator) return [state, Effect.none()];

        // Guard on unsaved changes:
        if (state.curator.isDirty) {
          if (state.confirmAlert === null) {
            // Unsaved-change refusal: stays presented and opens nested confirmation alert
            const alertContent: ConfirmAlertState = { workTitle: state.curator.spec.title };
            return [
              {
                ...state,
                confirmAlert: alertContent,
                confirmAlertPresentation: { status: 'presenting', content: alertContent }
              },
              Effect.none()
            ];
          }
          // Repeated close while dirty and confirmation already open must NOT bypass guard!
          return [state, Effect.none()];
        }

        // Clean: accepted close, transition to dismissing
        return [
          {
            ...state,
            curatorPresentation: { status: 'dismissing', content: state.curator }
          },
          Effect.none()
        ];
      }

      // Presented child actions
      const childAction = inner.action;
      if (!state.curator) return [state, Effect.none()];
      const current = state.curator;

      switch (childAction.type) {
        case 'editNotes': {
          const isDirty = childAction.notes !== current.initialNotes;
          const updatedCurator: CuratorModalState = {
            ...current,
            spec: { ...current.spec, curatorNotes: childAction.notes },
            isDirty,
            closeReady: null
          };
          return [
            {
              ...state,
              curator: updatedCurator,
              curatorPresentation: state.curatorPresentation.status !== 'idle'
                ? { ...state.curatorPresentation, content: updatedCurator }
                : state.curatorPresentation
            },
            Effect.none()
          ];
        }

        case 'save':
        case 'saveAndClose': {
          const nextRequestId = state.saveRequestId + 1;
          const targetInstanceId = current.instanceId;
          const specToSave = { ...current.spec };
          const closeAfter = childAction.type === 'saveAndClose';
          const updatedCurator: CuratorModalState = {
            ...current,
            isSaving: true,
            closeAfterSave: closeAfter,
            saveError: null,
            closeReady: null
          };

          return [
            {
              ...state,
              saveRequestId: nextRequestId,
              curator: updatedCurator,
              curatorPresentation: state.curatorPresentation.status !== 'idle'
                ? { ...state.curatorPresentation, content: updatedCurator }
                : state.curatorPresentation
            },
            Effect.run<AppAction>(async (dispatch) => {
              try {
                if (deps.saveCuratorWork) {
                  await deps.saveCuratorWork(specToSave.id, specToSave.curatorNotes);
                } else {
                  await new Promise((resolve) => setTimeout(resolve, 30));
                }
              } catch (error) {
                dispatch({
                  type: 'curatorSaveFailed',
                  requestId: nextRequestId,
                  instanceId: targetInstanceId,
                  message: error instanceof Error ? error.message : String(error)
                });
                return;
              }
              dispatch({
                type: 'curatorSaveSucceeded',
                requestId: nextRequestId,
                instanceId: targetInstanceId,
                spec: { ...specToSave, lastSavedAt: new Date().toISOString() }
              });
            })
          ];
        }

        case 'commitSavedClose': {
          // Only the readiness it names: a stale or repeated commit changes nothing.
          if (current.closeReady === null || current.closeReady !== childAction.requestId) return [state, Effect.none()];
          const presentation = state.curatorPresentation;
          // Atomically consume readiness, then revalidate request, saved revision and status.
          const accepted =
            childAction.requestId === state.saveRequestId &&
            !current.isDirty && current.spec.curatorNotes === current.initialNotes &&
            (presentation.status === 'presenting' || presentation.status === 'presented');
          const consumed: CuratorModalState = { ...current, closeReady: null };
          return [
            {
              ...state,
              curator: consumed,
              curatorPresentation: accepted
                ? { status: 'dismissing', content: consumed }
                : presentation.status !== 'idle' ? { ...presentation, content: consumed } : presentation
            },
            Effect.none()
          ];
        }

      }
    }

    case 'curatorSaveSucceeded': {
      const { requestId, instanceId, spec: savedSpec } = action;
      // The catalog takes a result only if it is the newest save applied for that work (out-of-order completion).
      const newest = requestId > (state.catalogRevisions[savedSpec.id] ?? 0);
      const nextSpecs = newest ? { ...state.specs, [savedSpec.id]: savedSpec } : state.specs;
      const catalogRevisions = newest ? { ...state.catalogRevisions, [savedSpec.id]: requestId } : state.catalogRevisions;

      // Stale-save owner/request protection:
      // Reopening while prior save pending must not modify new instance/draft!
      const isCurrentInstance =
        state.curator !== null &&
        state.curator.instanceId === instanceId &&
        requestId === state.saveRequestId;

      // Also idempotent: a repeated result for the current request that already settled (not saving) changes only
      // the ordered catalog, never the curator or its unconsumed readiness.
      if (!isCurrentInstance || !state.curator!.isSaving) {
        return [{ ...state, specs: nextSpecs, catalogRevisions }, Effect.none()];
      }

      // Notes typed while the save was in flight stay the draft: they are newer than what was saved.
      const draftNotes = state.curator!.spec.curatorNotes;
      const stillDirty = draftNotes !== savedSpec.curatorNotes;
      const updatedCurator: CuratorModalState = {
        ...state.curator!,
        spec: { ...savedSpec, curatorNotes: draftNotes },
        initialNotes: savedSpec.curatorNotes,
        isDirty: stillDirty,
        isSaving: false,
        closeAfterSave: false
      };
      const presentation = state.curatorPresentation;
      // Save & Close: the close itself is a separate, synchronous accepted commit (`commitSavedClose`) that the
      // view issues through its explicit transition entry. Only while the modal is open and nothing newer is unsaved;
      // a save completing after the modal began closing (discard) never re-presents it.
      const closeReady =
        state.curator!.closeAfterSave && !stillDirty &&
        (presentation.status === 'presenting' || presentation.status === 'presented')
          ? requestId
          : null;
      const ready: CuratorModalState = { ...updatedCurator, closeReady };

      return [
        {
          ...state,
          specs: nextSpecs,
          catalogRevisions,
          curator: ready,
          curatorPresentation: presentation.status !== 'idle' ? { ...presentation, content: ready } : presentation
        },
        Effect.none()
      ];
    }

    case 'curatorSaveFailed': {
      const isCurrent =
        state.curator !== null &&
        state.curator.instanceId === action.instanceId &&
        action.requestId === state.saveRequestId;
      // Only the pending current request; a repeated or late failure changes nothing.
      if (!isCurrent || !state.curator!.isSaving) return [state, Effect.none()];
      // The draft stays dirty and editable; the visitor can retry or discard.
      const updatedCurator: CuratorModalState = {
        ...state.curator!,
        isSaving: false,
        closeAfterSave: false,
        saveError: action.message,
        closeReady: null
      };
      return [
        {
          ...state,
          curator: updatedCurator,
          curatorPresentation: state.curatorPresentation.status !== 'idle'
            ? { ...state.curatorPresentation, content: updatedCurator }
            : state.curatorPresentation
        },
        Effect.none()
      ];
    }

    case 'curatorPresentation': {
      if (action.event.type === 'presentationCompleted' && state.curatorPresentation.status === 'presenting') {
        return [
          {
            ...state,
            curatorPresentation: { status: 'presented', content: state.curatorPresentation.content }
          },
          Effect.none()
        ];
      }
      if (action.event.type === 'dismissalCompleted' && state.curatorPresentation.status === 'dismissing') {
        return [
          {
            ...state,
            curator: null,
            curatorPresentation: { status: 'idle' }
          },
          Effect.none()
        ];
      }
      return [state, Effect.none()];
    }

    case 'confirmAlert': {
      const inner = action.action;
      if (inner.type === 'dismiss') {
        // Keep editing: dismiss alert dialog, curator modal remains presented & dirty
        if (state.confirmAlertPresentation.status === 'presenting' || state.confirmAlertPresentation.status === 'presented') {
          return [
            {
              ...state,
              confirmAlertPresentation: { status: 'dismissing', content: state.confirmAlertPresentation.content }
            },
            Effect.none()
          ];
        }
        return [state, Effect.none()];
      }

      const childAction = inner.action;
      switch (childAction.type) {
        case 'keepEditing': {
          if (state.confirmAlertPresentation.status === 'presenting' || state.confirmAlertPresentation.status === 'presented') {
            return [
              {
                ...state,
                confirmAlertPresentation: { status: 'dismissing', content: state.confirmAlertPresentation.content }
              },
              Effect.none()
            ];
          }
          return [state, Effect.none()];
        }

        case 'confirmDiscard': {
          // Discard confirmed: revert curator notes to initial notes, dismiss both alert and modal
          const cleanCurator = state.curator
            ? { ...state.curator, isDirty: false, spec: { ...state.curator.spec, curatorNotes: state.curator.initialNotes } }
            : null;

          return [
            {
              ...state,
              curator: cleanCurator,
              confirmAlertPresentation: state.confirmAlertPresentation.status !== 'idle'
                ? { status: 'dismissing', content: state.confirmAlertPresentation.content }
                : { status: 'idle' },
              curatorPresentation: cleanCurator
                ? { status: 'dismissing', content: cleanCurator }
                : { status: 'idle' }
            },
            Effect.none()
          ];
        }
      }
    }

    case 'confirmAlertPresentation': {
      if (action.event.type === 'presentationCompleted' && state.confirmAlertPresentation.status === 'presenting') {
        return [
          {
            ...state,
            confirmAlertPresentation: { status: 'presented', content: state.confirmAlertPresentation.content }
          },
          Effect.none()
        ];
      }
      if (action.event.type === 'dismissalCompleted' && state.confirmAlertPresentation.status === 'dismissing') {
        return [
          {
            ...state,
            confirmAlert: null,
            confirmAlertPresentation: { status: 'idle' }
          },
          Effect.none()
        ];
      }
      return [state, Effect.none()];
    }

    case 'openDrawer': {
      const workId = action.id ?? 'pavilion';
      const drawerContent: DrawerState = { workId, tab: 'engineering' };
      return [
        {
          ...state,
          drawer: drawerContent,
          drawerPresentation: { status: 'presenting', content: drawerContent }
        },
        Effect.none()
      ];
    }

    case 'closeDrawer': {
      return rootReducer(state, { type: 'drawer', action: { type: 'dismiss' } }, deps);
    }

    case 'drawer': {
      const inner = action.action;
      if (inner.type === 'dismiss') {
        if (state.drawerPresentation.status === 'presenting' || state.drawerPresentation.status === 'presented') {
          return [
            {
              ...state,
              drawerPresentation: { status: 'dismissing', content: state.drawerPresentation.content }
            },
            Effect.none()
          ];
        }
        return [state, Effect.none()];
      }

      if (state.drawer) {
        const nextDrawer: DrawerState = { ...state.drawer, tab: inner.action.tab };
        return [
          {
            ...state,
            drawer: nextDrawer,
            drawerPresentation: state.drawerPresentation.status !== 'idle'
              ? { ...state.drawerPresentation, content: nextDrawer }
              : state.drawerPresentation
          },
          Effect.none()
        ];
      }
      return [state, Effect.none()];
    }

    case 'drawerPresentation': {
      if (action.event.type === 'presentationCompleted' && state.drawerPresentation.status === 'presenting') {
        return [
          {
            ...state,
            drawerPresentation: { status: 'presented', content: state.drawerPresentation.content }
          },
          Effect.none()
        ];
      }
      if (action.event.type === 'dismissalCompleted' && state.drawerPresentation.status === 'dismissing') {
        return [
          {
            ...state,
            drawer: null,
            drawerPresentation: { status: 'idle' }
          },
          Effect.none()
        ];
      }
      return [state, Effect.none()];
    }

    case 'page': {
      if (action.action.type === 'presented' && action.action.action.type === 'home') {
        const homeAction = action.action.action.action;
        if (homeAction.type === 'openCurator') {
          return rootReducer(state, { type: 'openCuratorModal', id: homeAction.id }, deps);
        }
        if (homeAction.type === 'openDrawer') {
          return rootReducer(state, { type: 'openDrawer', id: homeAction.id }, deps);
        }
      }
      return [state, Effect.none()];
    }

    case 'scene':
      return [state, Effect.none()];
  }
};

export const pageSlot = destinationSlot<AppState, AppAction>()('page', pages);
export const sceneSlot = optionalSlot<AppState, AppAction>()('scene');
export const curatorSlot = optionalSlot<AppState, AppAction>()('curator');
export const confirmAlertSlot = optionalSlot<AppState, AppAction>()('confirmAlert');
export const drawerSlot = optionalSlot<AppState, AppAction>()('drawer');

export const composition = new ManagedIntegrationBuilder(rootReducer)
  .with(pageSlot, { replaceOn: action => action.type === 'navigate' })
  .with(sceneSlot, graphicsReducer)
  .with(curatorSlot, curatorReducer, { dismissal: 'deferred' })
  .with(confirmAlertSlot, confirmAlertReducer, { dismissal: 'deferred' })
  .with(drawerSlot, drawerReducer, { dismissal: 'deferred' })
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

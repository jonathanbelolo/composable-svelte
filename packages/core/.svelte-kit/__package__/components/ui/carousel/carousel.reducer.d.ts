/**
 * Carousel Reducer
 *
 * Pure business logic for the carousel component following the Composable Architecture pattern.
 */
import type { Effect as EffectType } from '../../../types.js';
import type { CarouselState, CarouselAction, CarouselDependencies } from './carousel.types.js';
/**
 * Main reducer for the Carousel component
 */
export declare function carouselReducer<T = unknown>(state: CarouselState<T>, action: CarouselAction, deps?: CarouselDependencies<T>): [CarouselState<T>, EffectType<CarouselAction>];
//# sourceMappingURL=carousel.reducer.d.ts.map
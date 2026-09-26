import { defineApplication } from '@composable-svelte/core/application';
import { reducer, type State } from './counter';

export const application = defineApplication(reducer, {
  initialState: (input: State) => ({ ...input })
});

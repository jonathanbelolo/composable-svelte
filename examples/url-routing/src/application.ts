import { defineApplication } from '@composable-svelte/core/application';
import { inventoryReducer, createInitialState } from './reducer';
import { parseInventoryURL, serializeInventoryState } from './routing';

export const inventoryApplication = defineApplication(inventoryReducer, {
  initialState: (url: string) => createInitialState(parseInventoryURL(url)),
  routing: {
    fragment: 'native',
    serialize: state => serializeInventoryState(state.route),
    request: url => {
      const route = parseInventoryURL(url);
      return {action:{type:'routeRequested',route},expectedURL:serializeInventoryState(route)};
    }
  }
});

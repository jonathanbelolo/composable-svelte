import preset, {contentGlob} from '@composable-svelte/core/tailwind-preset';
export default {presets:[preset],content:['./src/**/*.{html,js,svelte,ts}',contentGlob]};

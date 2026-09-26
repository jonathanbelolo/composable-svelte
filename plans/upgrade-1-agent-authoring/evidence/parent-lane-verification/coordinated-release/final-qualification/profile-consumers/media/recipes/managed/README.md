# Managed Media recipe

These two Svelte components ship in the npm archive. `ManagedPlayer.svelte`
opens an `optionalSlot` for an audio player; `ManagedVoice.svelte` opens one for
VoiceInput and copies each accepted transcript into parent business state.
`managed.test.ts` uses fake browser devices to make playback, transcript
handoff, and owner retirement deterministic.

In a Svelte/Vite consumer with compatible `@composable-svelte/core`,
`@composable-svelte/media`, Svelte, Vitest, Playwright,
`@vitest/browser-playwright`, and `@sveltejs/vite-plugin-svelte` installed:

```sh
mkdir -p recipes
cp -R node_modules/@composable-svelte/media/recipes/managed recipes/managed
npx vitest run --config recipes/managed/vitest.config.ts
```

The copy keeps tests out of `node_modules`, which Vitest excludes. A managed
child receives the exact `FeatureViewProps.store` supplied by its owner. The
media reducer owns playback/recording state; the parent reducer owns durable
transcripts. `createAudioManager` and `getAudioManager` should return the same
manager for one live recording id, and `deleteAudioManager` must release it.
Unmounting VoiceInput releases microphone UI work; owner retirement or store
destruction cancels remaining recording/transcription work. Real microphone
behavior needs a physical-device check beyond this deterministic fake. If
commands do not reach a view, check the live slot, avoid copying/wrapping its
ChildView, and dedupe core. Browser autoplay and microphone permissions still
apply in an actual app.

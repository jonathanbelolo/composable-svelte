<!--
	Mirrors: packages/graphics/README.md, .claude/skills/composable-svelte-graphics/SKILL.md

	The example whose every prop was fabricated two rounds ago —
	`<WebGLOverlay {store} width={800} height={600} />`, against a component
	taking one prop. Wrong props are a semantic error the parse-only guard
	could not see; compiling this file is what sees them.
-->
<script lang="ts">
  import { WebGLOverlay } from '@composable-svelte/graphics';

  let overlay: WebGLOverlay | null = $state(null);
  let hero: HTMLImageElement | null = $state(null);

  function applyEffect(): void {
    if (!overlay || !hero) return;
    overlay.registerElement({
      id: 'hero',
      domElement: hero,
      shader: 'ripple-gentle'
    });
  }
</script>

<WebGLOverlay bind:this={overlay} />
<img bind:this={hero} src="/hero.jpg" alt="Hero" onload={applyEffect} />

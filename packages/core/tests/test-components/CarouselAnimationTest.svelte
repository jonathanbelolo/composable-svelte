<script lang="ts">
	import Carousel from '../../src/lib/components/ui/carousel/Carousel.svelte';

	const slides = [
		{ id: 'a', data: { label: 'One' } },
		{ id: 'b', data: { label: 'Two' } },
		{ id: 'c', data: { label: 'Three' } }
	];
</script>

<div style="width: 300px;">
	<Carousel {slides}>
		{#snippet children({ slide })}
			<div style="height: 80px;">{slide.data?.label}</div>
		{/snippet}
	</Carousel>
</div>

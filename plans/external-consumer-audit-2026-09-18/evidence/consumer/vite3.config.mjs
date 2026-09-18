import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwind from 'tailwindcss3';
export default defineConfig({plugins:[svelte()],resolve:{alias:[{find:'./app.css',replacement:new URL('./src/app-v3.css',import.meta.url).pathname}]},css:{postcss:{plugins:[tailwind('./tailwind3.config.mjs')]}},build:{outDir:'dist-v3'}});

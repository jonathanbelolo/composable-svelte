import { mount } from 'svelte';
import AppUnderTest from './AppUnderTest.svelte';

mount(AppUnderTest, { target: document.getElementById('app')! });

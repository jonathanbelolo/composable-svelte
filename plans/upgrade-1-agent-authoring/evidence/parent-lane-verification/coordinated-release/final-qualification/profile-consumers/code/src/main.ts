import { mount } from 'svelte';
import CodeHost from './CodeHost.svelte';

mount(CodeHost, { target: document.getElementById('code')! });

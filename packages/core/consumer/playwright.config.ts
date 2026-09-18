import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./browser',use:{baseURL:'http://127.0.0.1:4173'},webServer:{command:'npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',url:'http://127.0.0.1:4173',reuseExistingServer:false}});

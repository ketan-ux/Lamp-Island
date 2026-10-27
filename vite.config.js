import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:https` serves over HTTPS on the LAN so a Quest headset can open
// the dev server directly (WebXR requires a secure context off localhost).
export default defineConfig(({ mode }) => ({
	base: './',
	plugins: mode === 'https' ? [basicSsl()] : [],
	server: { host: true },
	build: {
		target: 'es2022',
		chunkSizeWarningLimit: 1500,
	},
}));

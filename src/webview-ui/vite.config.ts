import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
	base: './',
	build: {
		outDir: '../../dist/webview-ui',
		emptyOutDir: true,
		rollupOptions: {
			output: {
				entryFileNames: 'assets/index.js',
				chunkFileNames: 'assets/index-chunk.js',
				assetFileNames: 'assets/[name].[ext]',
			},
		},
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
	server: {
		host: 'localhost',
		port: 5173,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
			'Access-Control-Allow-Headers':
				'X-Requested-With, content-type, Authorization',
		},
	},
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: './src/tests/setup.ts',
	},
})

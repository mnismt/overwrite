import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vitest/config'

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
		// Use process forks to avoid tinypool/worker teardown crashes in some sandboxes
		pool: 'forks',
		poolOptions: {
			forks: {
				singleFork: true,
			},
		},
	},
})

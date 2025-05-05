const { build } = require('esbuild');
const path = require('node:path');
const glob = require('glob');
const { execSync } = require('node:child_process');
const fs = require('node:fs');

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

const extensionEntryPoints = ['./src/extension.ts'];

// Find all test files
const testFiles = glob.sync('./src/test/**/*.ts');

// Combine extension and test entry points
const allEntryPoints = [...extensionEntryPoints, ...testFiles];

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			for (const { text, location } of result.errors) {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			}
			console.log('[watch] build finished');
		});
	},
};

/**
 * @type {import('esbuild').BuildOptions}
 */
const sharedConfig = {
	bundle: true,
	minify: isProduction,
	sourcemap: !isProduction,
	external: ['vscode'], // Keep vscode external
	platform: 'node',
	logLevel: 'info',
};

// Build script for the extension
build({
	...sharedConfig,
	entryPoints: allEntryPoints, // Use combined entry points
	outdir: './out',
	format: 'cjs',
})
	.then(() => {
		if (isWatch) {
			console.log('[watch] build finished, watching for changes...');
		}
	})
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});

// Build script for the webview UI
const webviewEntryPoints = ['./src/webview-ui/src/main.tsx'];

build({
	...sharedConfig,
	entryPoints: webviewEntryPoints,
	outdir: './dist/webview-ui',
	format: 'esm',
	platform: 'browser',
	// Add specific webview build configurations here if needed
})
	.then(() => {
		if (isWatch) {
			console.log('[watch] webview build finished, watching for changes...');
		}
	})
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});

// Run Vite build for webview UI before building the extension
try {
	console.log('Building webview UI with Vite...');
	execSync('pnpm --filter webview-ui build', {
		stdio: 'inherit',
		cwd: path.resolve(__dirname),
	});
	console.log('Webview UI build complete.');

	// Copy codicons.css & codicon.ttf from node_modules to dist/webview-ui/assets
	const codiconsSource = path.join(__dirname, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css');
	const codiconsDest = path.join(__dirname, 'dist', 'webview-ui', 'assets', 'codicon.css');
	const codiconTtfSource = path.join(__dirname, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.ttf');
	const codiconTtfDest = path.join(__dirname, 'dist', 'webview-ui', 'assets', 'codicon.ttf');

	// Ensure the destination directory exists
	fs.mkdirSync(path.dirname(codiconsDest), { recursive: true });
	fs.mkdirSync(path.dirname(codiconTtfDest), { recursive: true });
	// Copy the file
	fs.copyFileSync(codiconsSource, codiconsDest);
	fs.copyFileSync(codiconTtfSource, codiconTtfDest);
	console.log('Copied codicons.css & codicon.ttf to dist/webview-ui/assets');
} catch (err) {
	console.error('Vite build failed:', err);
	process.exit(1);
}

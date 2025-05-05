const esbuild = require("esbuild");
const path = require("node:path");
const { execSync } = require("node:child_process");
const fs = require('node:fs');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

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

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});

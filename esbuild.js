const esbuild = require('esbuild')
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const production = process.argv.includes('--production')
const watch = process.argv.includes('--watch')

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started')
		})
		build.onEnd(result => {
			for (const { text, location } of result.errors) {
				console.error(`✘ [ERROR] ${text}`)
				console.error(`    ${location.file}:${location.line}:${location.column}:`)
			}
			console.log('[watch] build finished')
		})
	}
}

async function main() {
	if (production) {
		console.log('[info] Production mode: Cleaning previous webview assets...');
		const webviewUiDir = path.resolve(__dirname, 'src', 'webview-ui');
		const targetWebviewDir = path.resolve(__dirname, 'dist', 'webview-ui');
		if (fs.existsSync(targetWebviewDir)) {
			fs.rmSync(targetWebviewDir, { recursive: true, force: true });
			console.log(`[info] Cleaned existing webview assets at ${targetWebviewDir}`);
		}
		console.log(`[info] Building webview in ${webviewUiDir}...`);
		try {
			execSync('pnpm build', { cwd: webviewUiDir, stdio: 'inherit' });
			console.log('[info] Webview build successful.');

			// Copy codicons assets into webview build
			const codiconsSrcDir = path.resolve(__dirname, 'node_modules', '@vscode', 'codicons', 'dist');
			const assetsDir = path.resolve(targetWebviewDir, 'assets');
			console.log(`[info] Copying codicons assets from ${codiconsSrcDir} to ${assetsDir}...`);
			if (!fs.existsSync(codiconsSrcDir)) {
				console.error(`✘ [ERROR] Codicons source directory not found: ${codiconsSrcDir}`);
				process.exit(1);
			}
			try {
				const codiconFiles = fs.readdirSync(codiconsSrcDir);
				for (const fileName of codiconFiles) {
					const srcFile = path.join(codiconsSrcDir, fileName);
					const destFile = path.join(assetsDir, fileName);
					fs.copyFileSync(srcFile, destFile);
				}
				console.log(`[info] Copied codicons assets: ${codiconFiles.join(', ')}`);
			} catch (copyErr) {
				console.error('✘ [ERROR] Failed to copy codicons assets:');
				console.error(copyErr);
				process.exit(1);
			}
		} catch (buildError) {
			console.error('✘ [ERROR] Webview build failed:');
			if (buildError.stdout) console.error('Stdout:', buildError.stdout.toString());
			if (buildError.stderr) console.error('Stderr:', buildError.stderr.toString());
			if (!buildError.stdout && !buildError.stderr) console.error(buildError);
			process.exit(1);
		}
		console.log('[info] Webview setup for production completed.');
	}

	const ctx = await esbuild.context({
		entryPoints: ['src/extension.ts'],
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
			esbuildProblemMatcherPlugin
		]
	})
	if (watch) {
		await ctx.watch()
	} else {
		await ctx.rebuild()
		await ctx.dispose()
	}
}

main().catch(e => {
	console.error(e)
	process.exit(1)
})

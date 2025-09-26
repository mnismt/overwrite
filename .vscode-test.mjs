import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	// Match test files using the glob pattern
	files: 'out/test/**/*.test.js',
	// Use version from environment variable (set by CI matrix)
	version: process.env.VSCODE_VERSION || 'stable',
	// Path to the extension root folder
	extensionDevelopmentPath: './'
});

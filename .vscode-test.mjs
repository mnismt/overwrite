import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	// Match test files using the glob pattern
	files: 'out/test/**/*.test.js',
	// Use the insiders version of VS Code if preferred, otherwise 'stable'
	// version: 'insiders', 
	// Path to the extension root folder
	extensionDevelopmentPath: './'
});

import * as path from 'node:path'

/**
 * Maps file extensions to VS Code language identifiers for syntax highlighting.
 * Based on VS Code's built-in language definitions.
 */
const EXTENSION_TO_LANGUAGE_MAP: Record<string, string> = {
	// TypeScript
	'.ts': 'typescript',
	'.cts': 'typescript',
	'.mts': 'typescript',
	'.tsx': 'typescriptreact',

	// JavaScript
	'.js': 'javascript',
	'.mjs': 'javascript',
	'.cjs': 'javascript',
	'.jsx': 'javascriptreact',

	// Web
	'.html': 'html',
	'.htm': 'html',
	'.css': 'css',
	'.scss': 'scss',
	'.sass': 'sass',
	'.less': 'less',
	'.json': 'json',
	'.jsonc': 'jsonc',
	'.xml': 'xml',
	'.svg': 'xml',

	// Configuration
	'.yml': 'yaml',
	'.yaml': 'yaml',
	'.toml': 'toml',
	'.ini': 'ini',
	'.env': 'dotenv',

	// Markdown and documentation
	'.md': 'markdown',
	'.mdx': 'mdx',
	'.txt': 'plaintext',

	// Other popular languages
	'.py': 'python',
	'.rb': 'ruby',
	'.php': 'php',
	'.go': 'go',
	'.rs': 'rust',
	'.java': 'java',
	'.kt': 'kotlin',
	'.swift': 'swift',
	'.c': 'c',
	'.cpp': 'cpp',
	'.cc': 'cpp',
	'.cxx': 'cpp',
	'.h': 'c',
	'.hpp': 'cpp',
	'.cs': 'csharp',
	'.fs': 'fsharp',
	'.vb': 'vb',
	'.sql': 'sql',
	'.sh': 'shellscript',
	'.bash': 'shellscript',
	'.zsh': 'shellscript',
	'.fish': 'shellscript',
	'.ps1': 'powershell',
	'.dockerfile': 'dockerfile',
	'.r': 'r',
	'.scala': 'scala',
	'.clj': 'clojure',
	'.elm': 'elm',
	'.lua': 'lua',
	'.perl': 'perl',
	'.pl': 'perl',
	'.dart': 'dart',
	'.vue': 'vue',
	'.svelte': 'svelte',
}

/**
 * Determines the VS Code language identifier from a file path.
 *
 * @param filePath - The file path to analyze (can be relative or absolute)
 * @returns The VS Code language identifier (e.g., 'typescript', 'javascript', 'plaintext')
 *
 * @example
 * ```typescript
 * getLanguageIdFromPath('src/components/App.tsx') // Returns 'typescriptreact'
 * getLanguageIdFromPath('utils/helper.ts') // Returns 'typescript'
 * getLanguageIdFromPath('styles.css') // Returns 'css'
 * getLanguageIdFromPath('unknown.xyz') // Returns 'plaintext'
 * ```
 */
export function getLanguageIdFromPath(filePath: string): string {
	if (!filePath) {
		return 'plaintext'
	}

	const extension = path.extname(filePath).toLowerCase()

	// Handle files without extensions
	if (!extension) {
		// Check for common extensionless files by name
		const basename = path.basename(filePath).toLowerCase()
		switch (basename) {
			case 'dockerfile':
			case 'dockerfile.prod':
			case 'dockerfile.dev':
				return 'dockerfile'
			case 'makefile':
				return 'makefile'
			case 'rakefile':
				return 'ruby'
			case 'gemfile':
			case 'gemfile.lock':
				return 'ruby'
			default:
				return 'plaintext'
		}
	}

	return EXTENSION_TO_LANGUAGE_MAP[extension] || 'plaintext'
}

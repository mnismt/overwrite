// Utility functions related to VS Code Webviews

/**
 * Generates a random nonce string for Content Security Policy.
 * @returns A random 32-character string.
 */
export function getNonce(): string {
	let text = ''
	const possible =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length))
	}
	return text
}

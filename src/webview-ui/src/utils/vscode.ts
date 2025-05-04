// src/webview-ui/src/utils/vscode.ts

// Define the structure of the VS Code API that our webview expects
// Based on the previous 'declare const acquireVsCodeApi'
interface VsCodeApi {
	getState: () => unknown
	setState: (newState: unknown) => void
	postMessage: (message: unknown) => void
}

// Augment the Window interface to recognize our global variable
declare global {
	interface Window {
		vscodeApi: VsCodeApi
	}
}

// Export a function that returns the typed API
export function getVsCodeApi(): VsCodeApi {
	// Check if the API exists - it should be defined by the script injected in the HTML
	if (!window.vscodeApi) {
		// In a real scenario, you might want a more robust error handling
		// or a mock API for development outside VS Code
		console.error(
			'VS Code API not found. Make sure it is initialized in the HTML.',
		)
		// Return a dummy object to prevent immediate crashes, though functionality will be broken
		return {
			getState: () => ({}),
			setState: () => {},
			postMessage: (message) => {
				console.warn('VS Code API not available, message not sent:', message)
			},
		}
	}
	return window.vscodeApi
}

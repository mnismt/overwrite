// src/webview-ui/src/utils/vscode.ts

import type { VscodeTreeItem } from '../../../types'
import { createMockVsCodeApi } from './mock'

// Keep in sync with global.d.ts
interface VsCodeMessage {
	command: string
	payload?: unknown
	// Optional fields used by some flows (e.g., tokenCountResponse)
	requestId?: string
	[key: string]: unknown
}

interface VsCodeApi {
	postMessage: (message: VsCodeMessage) => void
	getState: () => unknown
	setState: (newState: unknown) => void
}

// Augment the Window interface to recognize our globals
declare global {
	interface Window {
		vscodeApi?: VsCodeApi
		__overwriteMockApi__?: {
			setFileTree: (tree: VscodeTreeItem[]) => void
			setExcludedFolders: (text: string) => void
			sendToWebview: (message: VsCodeMessage) => void
		}
	}
}

// Export a function that returns the typed API
export function getVsCodeApi(): VsCodeApi {
	// 1) Already injected by VS Code HTML glue
	if (window.vscodeApi) return window.vscodeApi

	// 2) Running inside VS Code but not yet captured
	if (typeof window.acquireVsCodeApi === 'function') {
		const real = window.acquireVsCodeApi()
		window.vscodeApi = real
		return real
	}

	// 3) Browser/dev: create a mock API
	const mock = createMockVsCodeApi()
	window.vscodeApi = mock
	// eslint-disable-next-line no-console
	console.info('[MockVSCode] Using mocked VS Code API')
	return mock
}

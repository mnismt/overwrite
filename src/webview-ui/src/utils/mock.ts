// src/webview-ui/src/utils/mock.ts
// Browser/dev mock implementation of the VS Code webview API.

interface VsCodeMessage {
	command: string
	payload?: unknown
	requestId?: string
	[key: string]: unknown
}

export interface VsCodeApi {
	postMessage: (message: VsCodeMessage) => void
	getState: () => unknown
	setState: (newState: unknown) => void
}

import type { VscodeTreeItem } from '../../../types'

type ExcludedFoldersPayload = { excludedFolders: string }
type SaveSettingsPayload = { excludedFolders: string; readGitignore: boolean }
type TokenCountsPayload = { selectedUris: string[] }
type TokenCountPayload = { text: string; requestId: string }
type OpenFilePayload = { fileUri: string }

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function isExcludedFoldersPayload(v: unknown): v is ExcludedFoldersPayload {
	return (
		isObject(v) &&
		typeof (v as Record<string, unknown>).excludedFolders === 'string'
	)
}

function isTokenCountsPayload(v: unknown): v is TokenCountsPayload {
	if (!isObject(v)) return false
	const sel = (v as Record<string, unknown>).selectedUris
	return Array.isArray(sel) && sel.every((s) => typeof s === 'string')
}

function isTokenCountPayload(v: unknown): v is TokenCountPayload {
	if (!isObject(v)) return false
	const obj = v as Record<string, unknown>
	return typeof obj.text === 'string' && typeof obj.requestId === 'string'
}

function isOpenFilePayload(v: unknown): v is OpenFilePayload {
	return (
		isObject(v) && typeof (v as Record<string, unknown>).fileUri === 'string'
	)
}

function buildMockFileTree(): VscodeTreeItem[] {
	// Minimal, but realistic, VscodeTreeItem-shaped mock
	const tree: VscodeTreeItem[] = [
		{
			label: 'workspace',
			value: 'file:///mock/workspace',
			icons: { branch: 'folder', open: 'folder-opened', leaf: 'file' },
			subItems: [
				{
					label: 'src',
					value: 'file:///mock/workspace/src',
					icons: { branch: 'folder', open: 'folder-opened', leaf: 'file' },
					subItems: [
						{
							label: 'index.tsx',
							value: 'file:///mock/workspace/src/index.tsx',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: 'app.ts',
							value: 'file:///mock/workspace/src/app.ts',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
					],
				},
				{
					label: 'README.md',
					value: 'file:///mock/workspace/README.md',
					icons: { branch: 'file', open: 'file', leaf: 'file' },
				},
			],
		},
	]
	return tree
}

function estimateTokensFromText(text: string): number {
	return Math.ceil((text || '').length / 4)
}

export function createMockVsCodeApi(): VsCodeApi {
	let state: unknown = {}
	let excludedFolders = ''
	let readGitignore = true
	let fileTree: VscodeTreeItem[] = buildMockFileTree()

	const sendToWebview = (message: VsCodeMessage) => {
		window.postMessage(message, '*')
	}

	const api: VsCodeApi = {
		getState: () => state,
		setState: (newState) => {
			state = newState
		},
		postMessage: (message: VsCodeMessage) => {
			const { command, payload } = message
			setTimeout(() => {
				switch (command) {
					case 'getFileTree': {
						if (isExcludedFoldersPayload(payload)) {
							excludedFolders = payload.excludedFolders
						}
						if (
							isObject(payload) &&
							typeof (payload as any).readGitignore === 'boolean'
						) {
							readGitignore = (payload as any).readGitignore as boolean
						}
						sendToWebview({ command: 'updateFileTree', payload: fileTree })
						break
					}
					case 'getSettings': {
						sendToWebview({
							command: 'updateSettings',
							payload: { excludedFolders, readGitignore },
						})
						break
					}
					case 'saveSettings': {
						const p = payload as SaveSettingsPayload
						if (isObject(p)) {
							if (typeof p.excludedFolders === 'string') {
								excludedFolders = p.excludedFolders
							}
							if (typeof p.readGitignore === 'boolean') {
								readGitignore = p.readGitignore
							}
						}
						break
					}
					case 'getExcludedFolders': {
						sendToWebview({
							command: 'updateExcludedFolders',
							payload: { excludedFolders },
						})
						// Also send combined settings for newer clients
						sendToWebview({
							command: 'updateSettings',
							payload: { excludedFolders, readGitignore },
						})
						break
					}
					case 'saveExcludedFolders': {
						if (isExcludedFoldersPayload(payload)) {
							excludedFolders = payload.excludedFolders
						}
						break
					}
					case 'getTokenCounts': {
						const selectedUris: string[] = isTokenCountsPayload(payload)
							? payload.selectedUris
							: []
						const tokenCounts: Record<string, number> = {}
						for (const uri of selectedUris) {
							tokenCounts[uri] = Math.max(10, estimateTokensFromText(uri) * 3)
						}
						sendToWebview({
							command: 'updateTokenCounts',
							payload: { tokenCounts, skippedFiles: [] },
						})
						break
					}
					case 'getTokenCount': {
						const { text, requestId } = isTokenCountPayload(payload)
							? payload
							: { text: '', requestId: '' }
						sendToWebview({
							command: 'tokenCountResponse',
							requestId,
							tokenCount: estimateTokensFromText(text),
						})
						break
					}
					case 'openFile': {
						if (isOpenFilePayload(payload)) {
							console.log('[MockVSCode] openFile', payload.fileUri)
						} else {
							console.log('[MockVSCode] openFile (invalid payload)')
						}
						break
					}
					case 'copyContext':
					case 'copyContextXml': {
						console.log('[MockVSCode] copy context', command, payload)
						break
					}
					case 'applyChanges': {
						sendToWebview({
							command: 'applyChangesResult',
							success: true,
							results: [
								{
									path: '/mock/workspace/src/new-file.ts',
									action: 'create',
									success: true,
									message: 'Created file',
								},
								{
									path: '/mock/workspace/README.md',
									action: 'modify',
									success: true,
									message: 'Updated content',
								},
							],
						})
						break
					}
					default: {
						console.warn('[MockVSCode] Unhandled command', command, payload)
					}
				}
			}, 10)
		},
	}

	// Expose test hooks for Playwright
	window.__overwriteMockApi__ = {
		setFileTree: (tree: VscodeTreeItem[]) => {
			fileTree = Array.isArray(tree) ? tree : fileTree
		},
		setExcludedFolders: (text: string) => {
			if (typeof text === 'string') excludedFolders = text
		},
		sendToWebview: (message: VsCodeMessage) => sendToWebview(message),
	}

	return api
}

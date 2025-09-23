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

import type { VscodeTreeItem } from '../types'

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
	// Minimal, but realistic, VscodeTreeItem-shaped mock with expanded first level
	const tree: VscodeTreeItem[] = [
		{
			label: 'portfolio',
			value: 'file:///mock/portfolio',
			icons: { branch: 'folder', open: 'folder-opened', leaf: 'file' },
			open: true, // Default to expanded like VS Code
			subItems: [
				{
					label: '.cursor',
					value: 'file:///mock/portfolio/.cursor',
					icons: { branch: 'folder', open: 'folder-opened', leaf: 'file' },
					subItems: [
						{
							label: 'rules',
							value: 'file:///mock/portfolio/.cursor/rules',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
					],
				},
				{
					label: '.husky',
					value: 'file:///mock/portfolio/.husky',
					icons: { branch: 'folder', open: 'folder-opened', leaf: 'file' },
					subItems: [
						{
							label: '_',
							value: 'file:///mock/portfolio/.husky/_',
							icons: { branch: 'folder', open: 'folder-opened', leaf: 'file' },
							subItems: [
								{
									label: '.gitignore',
									value: 'file:///mock/portfolio/.husky/_/.gitignore',
									icons: { branch: 'file', open: 'file', leaf: 'file' },
								},
								{
									label: 'applypatch-msg',
									value: 'file:///mock/portfolio/.husky/_/applypatch-msg',
									icons: { branch: 'file', open: 'file', leaf: 'file' },
								},
								{
									label: 'commit-msg',
									value: 'file:///mock/portfolio/.husky/_/commit-msg',
									icons: { branch: 'file', open: 'file', leaf: 'file' },
								},
								{
									label: 'h',
									value: 'file:///mock/portfolio/.husky/_/h',
									icons: { branch: 'file', open: 'file', leaf: 'file' },
								},
								{
									label: 'husky.sh',
									value: 'file:///mock/portfolio/.husky/_/husky.sh',
									icons: { branch: 'file', open: 'file', leaf: 'file' },
								},
								{
									label: 'post-applypatch',
									value: 'file:///mock/portfolio/.husky/_/post-applypatch',
									icons: { branch: 'file', open: 'file', leaf: 'file' },
								},
								{
									label: 'post-checkout',
									value: 'file:///mock/portfolio/.husky/_/post-checkout',
									icons: { branch: 'file', open: 'file', leaf: 'file' },
								},
								{
									label: 'post-commit',
									value: 'file:///mock/portfolio/.husky/_/post-commit',
									icons: { branch: 'file', open: 'file', leaf: 'file' },
								},
								{
									label: 'post-merge',
									value: 'file:///mock/portfolio/.husky/_/post-merge',
									icons: { branch: 'file', open: 'file', leaf: 'file' },
								},
								{
									label: 'post-rewrite',
									value: 'file:///mock/portfolio/.husky/_/post-rewrite',
									icons: { branch: 'file', open: 'file', leaf: 'file' },
								},
								{
									label: 'pre-applypatch',
									value: 'file:///mock/portfolio/.husky/_/pre-applypatch',
									icons: { branch: 'file', open: 'file', leaf: 'file' },
								},
								{
									label: 'pre-auto-gc',
									value: 'file:///mock/portfolio/.husky/_/pre-auto-gc',
									icons: { branch: 'file', open: 'file', leaf: 'file' },
								},
								{
									label: 'pre-commit',
									value: 'file:///mock/portfolio/.husky/_/pre-commit',
									icons: { branch: 'file', open: 'file', leaf: 'file' },
								},
								{
									label: 'pre-merge-commit',
									value: 'file:///mock/portfolio/.husky/_/pre-merge-commit',
									icons: { branch: 'file', open: 'file', leaf: 'file' },
								},
								{
									label: 'pre-push',
									value: 'file:///mock/portfolio/.husky/_/pre-push',
									icons: { branch: 'file', open: 'file', leaf: 'file' },
								},
								{
									label: 'pre-rebase',
									value: 'file:///mock/portfolio/.husky/_/pre-rebase',
									icons: { branch: 'file', open: 'file', leaf: 'file' },
								},
								{
									label: 'prepare-commit-msg',
									value: 'file:///mock/portfolio/.husky/_/prepare-commit-msg',
									icons: { branch: 'file', open: 'file', leaf: 'file' },
								},
							],
						},
						{
							label: 'pre-commit',
							value: 'file:///mock/portfolio/.husky/pre-commit',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
					],
				},
				{
					label: '.next',
					value: 'file:///mock/portfolio/.next',
					icons: { branch: 'file', open: 'file', leaf: 'file' },
				},
				{
					label: '.vscode',
					value: 'file:///mock/portfolio/.vscode',
					icons: { branch: 'folder', open: 'folder-opened', leaf: 'file' },
					subItems: [
						{
							label: 'docs',
							value: 'file:///mock/portfolio/.vscode/docs',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: 'public',
							value: 'file:///mock/portfolio/.vscode/public',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: 'src',
							value: 'file:///mock/portfolio/.vscode/src',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
					],
				},
				{
					label: 'docs',
					value: 'file:///mock/portfolio/docs',
					icons: { branch: 'folder', open: 'folder-opened', leaf: 'file' },
					subItems: [
						{
							label: 'public',
							value: 'file:///mock/portfolio/docs/public',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: 'src',
							value: 'file:///mock/portfolio/docs/src',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
					],
				},
				{
					label: 'public',
					value: 'file:///mock/portfolio/public',
					icons: { branch: 'folder', open: 'folder-opened', leaf: 'file' },
					subItems: [],
				},
				{
					label: 'src',
					value: 'file:///mock/portfolio/src',
					icons: { branch: 'folder', open: 'folder-opened', leaf: 'file' },
					subItems: [
						{
							label: '.env.example',
							value: 'file:///mock/portfolio/src/.env.example',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: '.eslintignore',
							value: 'file:///mock/portfolio/src/.eslintignore',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: '.eslintrc.js',
							value: 'file:///mock/portfolio/src/.eslintrc.js',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: '.gitignore',
							value: 'file:///mock/portfolio/src/.gitignore',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: '.lintstagedrc.json',
							value: 'file:///mock/portfolio/src/.lintstagedrc.json',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: '.prettierrc',
							value: 'file:///mock/portfolio/src/.prettierrc',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: '.prettierrc.json',
							value: 'file:///mock/portfolio/src/.prettierrc.json',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: '.release-it.json',
							value: 'file:///mock/portfolio/src/.release-it.json',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: '.windsurftrules',
							value: 'file:///mock/portfolio/src/.windsurftrules',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: 'CHANGELOG.md',
							value: 'file:///mock/portfolio/src/CHANGELOG.md',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: 'components.json',
							value: 'file:///mock/portfolio/src/components.json',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: 'docker-compose.yml',
							value: 'file:///mock/portfolio/src/docker-compose.yml',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: 'Dockerfile',
							value: 'file:///mock/portfolio/src/Dockerfile',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: 'next.config.mjs',
							value: 'file:///mock/portfolio/src/next.config.mjs',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: 'package.json',
							value: 'file:///mock/portfolio/src/package.json',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: 'pnpm-lock.yaml',
							value: 'file:///mock/portfolio/src/pnpm-lock.yaml',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: 'postcss.config.mjs',
							value: 'file:///mock/portfolio/src/postcss.config.mjs',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: 'README.md',
							value: 'file:///mock/portfolio/src/README.md',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: 'sync-local.sh',
							value: 'file:///mock/portfolio/src/sync-local.sh',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: 'sync-remote.sh',
							value: 'file:///mock/portfolio/src/sync-remote.sh',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: 'tailwind.config.ts',
							value: 'file:///mock/portfolio/src/tailwind.config.ts',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
						{
							label: 'tsconfig.json',
							value: 'file:///mock/portfolio/src/tsconfig.json',
							icons: { branch: 'file', open: 'file', leaf: 'file' },
						},
					],
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
							typeof (payload as { readGitignore?: boolean }).readGitignore ===
								'boolean'
						) {
							readGitignore = (payload as { readGitignore?: boolean })
								.readGitignore as boolean
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

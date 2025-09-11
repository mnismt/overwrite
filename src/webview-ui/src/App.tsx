import type { VscTabsSelectEvent } from '@vscode-elements/elements/dist/vscode-tabs/vscode-tabs'
import { useCallback, useEffect, useState } from 'react'
import type { VscodeTreeItem } from '../../types' // Import tree item type from root
import './App.css' // We'll add styles later
import ApplyTab from './components/apply-tab/index'
import ContextTab from './components/context-tab'
import SettingsTab from './components/settings-tab'
import { getVsCodeApi } from './utils/vscode' // Import the new utility

interface VsCodeMessage {
	command: string
	payload?: unknown // Use unknown instead of any for better type safety
}

interface UpdateExcludedFoldersPayload {
	excludedFolders: string
}

function App() {
	const [activeTabIndex, setActiveTabIndex] = useState(0) // Manage by index (0: Context, 1: Apply)
	const [fileTreeData, setFileTreeData] = useState<VscodeTreeItem[]>([])
	// selectedPaths renamed to selectedUris, stores Set of URI strings
	const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set())
	const [isLoading, setIsLoading] = useState<boolean>(true) // For loading indicator
	const [errorText, setErrorText] = useState<string | null>(null) // Graceful error banner
	const [excludedFolders, setExcludedFolders] = useState<string>(
		'node_modules\n.git\ndist\nout\n.vscode-test',
	) // Persisted excluded folders

	// Send message to extension using the utility
	const sendMessage = useCallback((command: string, payload?: unknown) => {
		const vscode = getVsCodeApi()

		if (command === 'getFileTree') {
			setIsLoading(true)
		}
		vscode.postMessage({ command, payload })
	}, [])

	// Fetch initial file tree and excluded folders
	useEffect(() => {
		sendMessage('getFileTree')
		sendMessage('getExcludedFolders')
	}, [sendMessage])

	// Listen for messages from extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent<VsCodeMessage>) => {
			const message = event.data

			switch (message.command) {
				case 'updateFileTree':
					// TODO: Add type check for payload
					if (Array.isArray(message.payload)) {
						setFileTreeData(message.payload as VscodeTreeItem[])
					}
					setIsLoading(false)
					break
				case 'showError':
					// Display error message in a dismissible banner
					{
						const payload = message.payload as unknown
						let text = 'An unexpected error occurred.'
						if (typeof payload === 'string') {
							text = payload
						} else if (
							payload &&
							typeof payload === 'object' &&
							'message' in (payload as Record<string, unknown>) &&
							typeof (payload as { message?: unknown }).message === 'string'
						) {
							text = String((payload as { message: string }).message)
						}
						setErrorText(text)
						console.error('Error from extension:', text)
					}
					setIsLoading(false) // Stop loading on error too
					break
				case 'updateExcludedFolders': {
					// Update excluded folders from persisted state
					const payload = message.payload as UpdateExcludedFoldersPayload
					if (payload?.excludedFolders) {
						setExcludedFolders(payload.excludedFolders)
					}
					break
				}
				case 'tokenCountResponse':
					// Token count responses are handled individually by countTokens calls
					// No action needed here, just preventing the unknown command warning
					break
				case 'updateTokenCounts':
					// ContextTab listens for this and updates its own state.
					// Handle here to avoid unknown-command warnings.
					break
				case 'applyChangesResult':
					// ApplyTab listens for this and updates its own state.
					// Handle here to avoid unknown-command warnings.
					break
				case 'previewChangesResult':
					// ApplyTab listens for this and updates its own state.
					break
				default:
					console.warn('Received unknown message command:', message.command)
			}
		}

		window.addEventListener('message', handleMessage)
		return () => window.removeEventListener('message', handleMessage)
	}, []) // Depends only on initial setup

	// --- Tab Content Handlers ---

	const handleTabChange = useCallback((event: VscTabsSelectEvent) => {
		setActiveTabIndex(event.detail.selectedIndex)
	}, [])

	// Refresh handler for the file tree (moved from potential ExplorerTab)
	const handleRefresh = useCallback(
		(excludedFolders?: string) => {
			setIsLoading(true)
			sendMessage('getFileTree', { excludedFolders })
		},
		[sendMessage],
	)

	// Save excluded folders handler
	const handleSaveExcludedFolders = useCallback(
		(newExcludedFolders: string) => {
			setExcludedFolders(newExcludedFolders)
			// persist to extension
			sendMessage('saveExcludedFolders', {
				excludedFolders: newExcludedFolders,
			})
			// immediately refresh file tree using the saved exclusions
			sendMessage('getFileTree', { excludedFolders: newExcludedFolders })
		},
		[sendMessage],
	)

	// Selection handler (assuming it will be needed in the combined ContextTab)
	// Renamed paths to uris, expects a Set of URI strings
	const handleSelect = useCallback((uris: Set<string>) => {
		setSelectedUris(uris)
	}, [])

	// Context Tab: Handle copying
	const handleCopy = useCallback(
		({
			includeXml,
			userInstructions,
		}: { includeXml: boolean; userInstructions: string }) => {
			if (selectedUris.size === 0) {
				// Use selectedUris
				// Display warning in the UI since we can't show VS Code notifications from webview
				console.warn('No files selected. Please select files before copying.')
				return
			}

			// Send message to extension with payload
			sendMessage(includeXml ? 'copyContextXml' : 'copyContext', {
				selectedUris: Array.from(selectedUris), // Use selectedUris and correct payload key
				userInstructions,
			})
		},
		[selectedUris, sendMessage], // Depend on selectedUris
	)

	// Apply Tab: Handle applying changes
	const handleApply = useCallback(
		(responseText: string) => {
			sendMessage('applyChanges', { responseText })
		},
		[sendMessage],
	)

	// Apply Tab: Handle previewing changes (opens diff editors, no writes)
	const handlePreview = useCallback(
		(responseText: string) => {
			sendMessage('previewChanges', { responseText })
		},
		[sendMessage],
	)

	return (
		<main>
			<vscode-tabs
				selected-index={activeTabIndex}
				onvsc-tabs-select={handleTabChange}
			>
				<vscode-tab-header slot="header" id="context-tab">
					Context
				</vscode-tab-header>
				<vscode-tab-panel id="context-tab-panel">
					<ContextTab
						// Props for original Context functionality
						selectedCount={selectedUris.size} // Use selectedUris
						onCopy={handleCopy}
						// Props for Explorer functionality
						fileTreeData={fileTreeData}
						selectedUris={selectedUris} // Pass selectedUris
						onSelect={handleSelect} // Pass the handler
						onRefresh={handleRefresh}
						isLoading={isLoading}
					/>
				</vscode-tab-panel>

				{/* Apply Tab */}
				<vscode-tab-header slot="header" id="apply-tab">
					Apply
				</vscode-tab-header>
				<vscode-tab-panel id="apply-tab-panel">
					<ApplyTab onApply={handleApply} onPreview={handlePreview} />
				</vscode-tab-panel>

				{/* Settings Tab */}
				<vscode-tab-header slot="header" id="settings-tab">
					Settings
				</vscode-tab-header>
				<vscode-tab-panel id="settings-tab-panel">
					<SettingsTab
						excludedFolders={excludedFolders}
						onSaveExcludedFolders={handleSaveExcludedFolders}
					/>
				</vscode-tab-panel>
			</vscode-tabs>
		</main>
	)
}

export default App

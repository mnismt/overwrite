import type { VscTabsSelectEvent } from '@vscode-elements/elements/dist/vscode-tabs/vscode-tabs'
import { useCallback, useEffect, useState } from 'react'
import type { VscodeTreeItem } from '../../types' // Import tree item type from root
import './App.css' // We'll add styles later
import ApplyTab from './components/apply-tab'
import ContextTab from './components/context-tab'
import { getVsCodeApi } from './utils/vscode' // Import the new utility

interface VsCodeMessage {
	command: string
	payload?: unknown // Use unknown instead of any for better type safety
}

function App() {
	const [activeTabIndex, setActiveTabIndex] = useState(0) // Manage by index (0: Context, 1: Apply)
	const [fileTreeData, setFileTreeData] = useState<VscodeTreeItem[]>([])
	// selectedPaths renamed to selectedUris, stores Set of URI strings
	const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set())
	const [isLoading, setIsLoading] = useState<boolean>(true) // For loading indicator

	console.log('selectedUris', selectedUris)

	// Send message to extension using the utility
	const sendMessage = useCallback((command: string, payload?: unknown) => {
		const vscode = getVsCodeApi()

		if (command === 'getFileTree') {
			setIsLoading(true)
		}
		vscode.postMessage({ command, payload })
	}, [])

	// Fetch initial file tree
	useEffect(() => {
		sendMessage('getFileTree')
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
					// TODO: Display error message more gracefully
					console.error('Error from extension:', message.payload)
					setIsLoading(false) // Stop loading on error too
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
	const handleRefresh = useCallback(() => {
		setIsLoading(true)
		sendMessage('getFileTree')
	}, [sendMessage])

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
			sendMessage('applyChanges', { responseText }) // Define this command
			// TODO: Handle apply feedback
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
						// TODO: Add search/filter props and handler
					/>
				</vscode-tab-panel>

				{/* Apply Tab */}
				<vscode-tab-header slot="header" id="apply-tab">
					Apply
				</vscode-tab-header>
				<vscode-tab-panel id="apply-tab-panel">
					<ApplyTab onApply={handleApply} />
				</vscode-tab-panel>
			</vscode-tabs>
		</main>
	)
}

export default App

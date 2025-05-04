import React, { useState, useEffect, useCallback } from 'react'
import type { VscTabsSelectEvent } from '@vscode-elements/elements/dist/vscode-tabs/vscode-tabs'
import type { VscodeTreeItem } from '../../types' // Import tree item type from root
import ExplorerTab from './components/explorer-tab'
import ContextTab from './components/context-tab'
import ApplyTab from './components/apply-tab'
import { getVsCodeApi } from './utils/vscode' // Import the new utility
import './App.css' // We'll add styles later

// // Add acquireVsCodeApi declaration - REMOVED
// declare const acquireVsCodeApi: () => {
// 	getState: () => unknown
// 	setState: (newState: unknown) => void
// 	postMessage: (message: unknown) => void
// };

// // Acquire the VS Code API instance *once* outside the component - REMOVED
// const vscode = acquireVsCodeApi();

// Define the structure for messages to/from the extension
interface VsCodeMessage {
	command: string
	payload?: unknown // Use unknown instead of any for better type safety
}

function App() {
	const [activeTabIndex, setActiveTabIndex] = useState(0) // Manage by index
	const [fileTreeData, setFileTreeData] = useState<VscodeTreeItem[]>([])
	const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
	const [userInstructions, setUserInstructions] = useState<string>('')
	const [isLoading, setIsLoading] = useState<boolean>(true) // For loading indicator

	// --- Communication Handlers ---

	// Send message to extension using the utility
	const sendMessage = useCallback((command: string, payload?: unknown) => {
		const vscode = getVsCodeApi() // Get API instance via utility
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
			console.log('Message from extension:', message)

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

	// Context Tab: Handle copying
	const handleCopy = useCallback(
		(includeXml: boolean) => {
			sendMessage('copyContext', {
				selectedPaths: Array.from(selectedPaths),
				userInstructions,
				includeXml, // Determine command in extension based on this?
			})
			// Or send different commands:
			// sendMessage(includeXml ? 'copyContextXml' : 'copyContext', {
			//   selectedPaths: Array.from(selectedPaths),
			//   userInstructions,
			// });
		},
		[selectedPaths, userInstructions, sendMessage],
	)

	// Apply Tab: Handle applying changes
	const handleApply = useCallback(
		(responseText: string) => {
			sendMessage('applyChanges', { responseText }) // Define this command
			// TODO: Handle apply feedback
		},
		[sendMessage],
	)

	// TODO: Implement handleSelect for ExplorerTab to update selectedPaths
	const handleSelectionChange = useCallback((newSelectedPaths: Set<string>) => {
		setSelectedPaths(newSelectedPaths)
	}, [])

	return (
		<main>
			<vscode-tabs
				selected-index={activeTabIndex}
				onvsc-tabs-select={handleTabChange}
			>
				{/* Explorer Tab */}
				<vscode-tab-header slot="header" id="explorer-tab">
					Explorer
				</vscode-tab-header>
				<vscode-tab-panel
					id="explorer-tab-panel"
					style={{ display: 'flex', flexDirection: 'column' }}
				>
					<ExplorerTab />
				</vscode-tab-panel>

				{/* Context Tab */}
				<vscode-tab-header slot="header" id="context-tab">
					Context
				</vscode-tab-header>
				<vscode-tab-panel id="context-tab-panel">
					<ContextTab
						selectedCount={selectedPaths.size}
						userInstructions={userInstructions}
						onUserInstructionsChange={setUserInstructions}
						onCopy={handleCopy}
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

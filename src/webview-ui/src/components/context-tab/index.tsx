import type {
	VscTreeActionEvent,
	VscTreeSelectEvent,
} from '@vscode-elements/elements/dist/vscode-tree/vscode-tree'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { VscodeTreeItem } from '../../../../types'
import { getVsCodeApi } from '../../utils/vscode'
import {
	filterTreeData,
	getAllDescendantPaths,
	transformTreeData,
	countTokens,
	formatTokenCount,
} from './utils'

interface ContextTabProps {
	selectedCount: number
	onCopy: ({
		includeXml,
		userInstructions,
	}: {
		includeXml: boolean
		userInstructions: string
	}) => void
	fileTreeData: VscodeTreeItem[]
	selectedUris: Set<string> // Changed from selectedPaths
	onSelect: (uris: Set<string>) => void // Changed from paths
	onRefresh: () => void // Handler for refresh button
	isLoading: boolean // To show loading state
}

const ContextTab: React.FC<ContextTabProps> = ({
	selectedCount,
	onCopy,
	fileTreeData,
	selectedUris, // Changed from selectedPaths
	onSelect,
	onRefresh,
	isLoading,
}) => {
	// Ref for the vscode-tree element to update its data in place
	const [userInstructions, setUserInstructions] = useState('')
	// State for search query
	const [searchQuery, setSearchQuery] = useState('')
	const treeRef = useRef<any>(null)
	const [tokenStats, setTokenStats] = useState({
		fileTokensEstimate: 0,
		userInstructionsTokens: 0,
		totalTokens: 0,
		totalWithXmlTokens: 0,
	})
	const [actualTokenCounts, setActualTokenCounts] = useState<
		Record<string, number>
	>({})

	// State for tracking double-clicks
	const [lastClickedItem, setLastClickedItem] = useState<string | null>(null)
	const [lastClickTime, setLastClickTime] = useState<number>(0)

	// Constant for XML formatting instructions
	const XML_INSTRUCTIONS_TOKENS = 5000 // This is an approximation

	// Initialize tree data when fileTreeData loads or searchQuery changes
	useEffect(() => {
		if (treeRef.current) {
			// Filter based on search query, then generate tree with actions & decorations
			const baseItems = searchQuery
				? filterTreeData(fileTreeData, searchQuery)
				: fileTreeData
			const initialData = transformTreeData(baseItems, selectedUris) // Use selectedUris
			treeRef.current.data = initialData
		}
	}, [fileTreeData, searchQuery, selectedUris]) // Added selectedUris to dependency array for transformTreeData

	// Update only actions & decorations when selection changes
	useEffect(() => {
		if (treeRef.current) {
			const items: VscodeTreeItem[] = treeRef.current.data

			const updateItems = (nodes: VscodeTreeItem[]) => {
				for (const node of nodes) {
					const isSelected = selectedUris.has(node.value) // Use selectedUris
					node.actions = [
						{
							icon: isSelected ? 'close' : 'add',
							actionId: 'toggle-select',
							tooltip: isSelected ? 'Deselect' : 'Select',
						},
					]

					if (node.subItems && node.subItems.length > 0) {
						updateItems(node.subItems) // Recursively update children first

						const folderDecorations: Array<{
							content: string
							color?: string
						}> = []
						const allDescendants = getAllDescendantPaths(node) // Includes the folder itself
						const childDescendants = allDescendants.filter(
							(p) => p !== node.value,
						)
						const selectedChildDescendantsCount = childDescendants.filter(
							(uri) => selectedUris.has(uri), // Use selectedUris
						).length

						// Determine F/H selection status
						if (
							selectedChildDescendantsCount === childDescendants.length &&
							childDescendants.length > 0
						) {
							folderDecorations.push({
								content: 'F',
								color: 'var(--vscode-testing-iconPassed)',
							})
						} else if (selectedChildDescendantsCount > 0) {
							folderDecorations.push({
								content: 'H',
								color: 'var(--vscode-testing-iconQueued)',
							})
						} else if (selectedUris.has(node.value)) {
							// Use selectedUris
							// Folder itself is selected (e.g., an empty selected folder)
							folderDecorations.push({
								content: 'F',
								color: 'var(--vscode-testing-iconPassed)',
							})
						}

						// Calculate total tokens for selected files within this folder
						let folderTotalTokens = 0
						for (const descendantUri of allDescendants) {
							if (
								selectedUris.has(descendantUri) && // Use selectedUris
								actualTokenCounts[descendantUri] !== undefined
							) {
								folderTotalTokens += actualTokenCounts[descendantUri]
							}
						}

						if (folderTotalTokens > 0) {
							folderDecorations.push({
								content: `(${formatTokenCount(folderTotalTokens)})`,
								color: 'var(--vscode-testing-iconPassed)', // Same color as file tokens
							})
						}
						node.decorations =
							folderDecorations.length > 0 ? folderDecorations : undefined
					} else {
						// It's a file
						node.decorations = isSelected
							? [
									{ content: 'F', color: 'var(--vscode-testing-iconPassed)' },
									{
										content: `(${formatTokenCount(
											actualTokenCounts[node.value] || 0,
										)})`,
										color: 'var(--vscode-testing-iconPassed)',
									},
								]
							: undefined
					}
				}
			}

			updateItems(items)
			treeRef.current.data = [...items]
		}
	}, [selectedUris, actualTokenCounts]) // Depend on selectedUris

	// Effect to calculate total tokens based on actual file counts and instructions
	useEffect(() => {
		// Calculate total from actualTokenCounts
		const fileTotal = Object.values(actualTokenCounts).reduce(
			(sum, count) => sum + count,
			0,
		)

		const instructionsTokens = countTokens(userInstructions)

		setTokenStats({
			fileTokensEstimate: fileTotal,
			userInstructionsTokens: instructionsTokens,
			totalTokens: fileTotal + instructionsTokens,
			totalWithXmlTokens:
				fileTotal + instructionsTokens + XML_INSTRUCTIONS_TOKENS,
		})
	}, [actualTokenCounts, userInstructions])

	// Effect to request token counts when selection changes
	useEffect(() => {
		const vscode = getVsCodeApi()
		// Convert Set to Array before sending
		const urisArray = Array.from(selectedUris) // Use selectedUris
		if (urisArray.length > 0) {
			// Only send if there are selected URIs
			vscode.postMessage({
				command: 'getTokenCounts',
				payload: { selectedUris: urisArray }, // Use selectedUris key
			})
		} else {
			// If no URIs are selected, clear the actualTokenCounts
			setActualTokenCounts({})
		}
	}, [selectedUris]) // Depend on selectedUris

	// Effect to listen for token count updates from the extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.command === 'updateTokenCounts') {
				setActualTokenCounts(message.payload.tokenCounts || {})
			}
		}

		window.addEventListener('message', handleMessage)
		return () => window.removeEventListener('message', handleMessage)
	}, [])

	const handleRefreshClick = useCallback(() => onRefresh(), [onRefresh])
	const handleCopyContextClick = useCallback(
		() => onCopy({ includeXml: false, userInstructions }),
		[onCopy, userInstructions],
	)
	const handleCopyContextXmlClick = useCallback(
		() => onCopy({ includeXml: true, userInstructions }),
		[onCopy, userInstructions],
	)

	// Handler for clicking the action icon - Toggles ONLY the clicked item
	// Updated: Handles recursive selection/deselection for folders
	const handleTreeAction = useCallback(
		(event: VscTreeActionEvent) => {
			const actionId = event.detail.actionId
			const item = event.detail.item as VscodeTreeItem // item.value is a URI string

			if (actionId === 'toggle-select' && item?.value) {
				const newSelectedUris = new Set(selectedUris) // Use selectedUris
				const uri = item.value // This is a URI string
				const isCurrentlySelected = newSelectedUris.has(uri)

				// Check if it's a folder (has subItems)
				if (item.subItems && item.subItems.length > 0) {
					// It's a folder - apply recursive logic
					const allUris = getAllDescendantPaths(item) // Assumes this now returns URI strings

					if (isCurrentlySelected) {
						// Deselecting the folder and all its descendants
						for (const u of allUris) {
							newSelectedUris.delete(u)
						}
					} else {
						// Selecting the folder and all its descendants
						for (const u of allUris) {
							newSelectedUris.add(u)
						}
					}
				} else {
					// It's a file - simple toggle
					if (isCurrentlySelected) {
						newSelectedUris.delete(uri)
					} else {
						newSelectedUris.add(uri)
					}
				}

				// Notify parent with the updated set
				onSelect(newSelectedUris)
			}
		},
		[selectedUris, onSelect], // Depend on selectedUris
	)

	// Handle tree item selection with double-click detection
	const handleTreeSelect = useCallback(
		(event: VscTreeSelectEvent) => {
			const item = event.detail as VscodeTreeItem // item.value is a URI string
			if (!item?.value) return

			const clickedUri = item.value // This is a URI string
			const currentTime = Date.now()

			// Check if this is a double-click (same item clicked within 500ms)
			if (lastClickedItem === clickedUri && currentTime - lastClickTime < 500) {
				// It's a double-click - determine if it's a file or folder (leaf or branch)
				// Assuming itemType 'leaf' correctly identifies files.
				// The tree data generation in file-system.ts sets icons, but not itemType explicitly.
				// This might need adjustment if itemType is not reliably set by vscode-tree based on subItems.
				// For now, we assume files won't have subItems.
				if (!item.subItems || item.subItems.length === 0) {
					// A more robust check for file-like items
					// It's a file, send message to open it
					const vscode = getVsCodeApi()
					vscode.postMessage({
						command: 'openFile',
						payload: { fileUri: clickedUri }, // Use fileUri key
					})
				}

				// Reset tracking after processing double-click
				setLastClickedItem(null)
				setLastClickTime(0)
			} else {
				// It's a single click - update tracking
				setLastClickedItem(clickedUri)
				setLastClickTime(currentTime)
			}
		},
		[lastClickedItem, lastClickTime],
	)

	return (
		<div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
			{/* --- Explorer Top Bar --- */}
			<div
				style={{
					display: 'flex',
					marginBottom: '10px',
					marginTop: '10px',
					alignItems: 'center',
				}}
			>
				<vscode-button onClick={handleRefreshClick} disabled={isLoading}>
					<span slot="start" className="codicon codicon-refresh" />
					{isLoading ? 'Loading...' : 'Refresh'}
				</vscode-button>
				<vscode-textfield
					placeholder="Search files..."
					style={{ marginLeft: '10px', flexGrow: 1 }}
					value={searchQuery}
					onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
				>
					<span slot="start" className="codicon codicon-search" />
				</vscode-textfield>
			</div>

			{/* --- File Tree Area --- */}
			<div style={{ flexGrow: 1, overflow: 'auto', marginBottom: '10px' }}>
				{isLoading ? (
					<div
						style={{
							display: 'flex',
							justifyContent: 'center',
							alignItems: 'center',
							height: '100%',
						}}
					>
						<vscode-progress-ring />
					</div>
				) : (
					<vscode-tree
						ref={treeRef}
						onvsc-tree-action={handleTreeAction}
						onvsc-tree-select={handleTreeSelect}
						arrows
						indent-guides
					/>
				)}
			</div>

			{/* --- Original Context Elements Below Tree --- */}
			<vscode-divider />
			<div>Selected files: {selectedCount}</div>

			{/* Token Count Information */}
			<div
				style={{
					marginTop: '10px',
					fontSize: '0.9em',
					color: 'var(--vscode-descriptionForeground)',
				}}
			>
				<div>File tokens (actual): {tokenStats.fileTokensEstimate}</div>
				<div>User instruction tokens: {tokenStats.userInstructionsTokens}</div>
				<div>Total tokens (Copy Context): {tokenStats.totalTokens}</div>
				<div>
					Total tokens (Copy Context + XML): {tokenStats.totalWithXmlTokens}
				</div>
			</div>

			<div
				style={{ marginTop: '10px', display: 'flex', flexDirection: 'column' }}
			>
				<label htmlFor="user-instructions">User Instructions:</label>
				<vscode-textarea
					id="user-instructions"
					resize="vertical"
					rows={10}
					placeholder="Enter instructions for the AI..."
					value={userInstructions}
					onInput={(e) => {
						const target = e.target as HTMLInputElement
						setUserInstructions(target.value)
					}}
					style={{ marginTop: '5px', width: '100%', minHeight: '100px' }}
				/>
			</div>

			<div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
				<vscode-button onClick={handleCopyContextClick}>
					Copy Context
				</vscode-button>
				<vscode-button onClick={handleCopyContextXmlClick}>
					Copy Context + XML Instructions
				</vscode-button>
			</div>
		</div>
	)
}

export default ContextTab

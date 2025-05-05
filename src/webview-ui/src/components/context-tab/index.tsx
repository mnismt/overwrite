import type {
	VscTreeActionEvent,
	VscTreeSelectEvent,
} from '@vscode-elements/elements/dist/vscode-tree/vscode-tree'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { VscodeTreeItem } from '../../../../types'
import { getVsCodeApi } from '../../utils/vscode'
import {
	getAllDescendantPaths,
	transformTreeData,
	filterTreeData,
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
	selectedPaths: Set<string> // For displaying/managing selection in tree
	onSelect: (paths: Set<string>) => void // Handler for selection changes
	onRefresh: () => void // Handler for refresh button
	isLoading: boolean // To show loading state
}

const ContextTab: React.FC<ContextTabProps> = ({
	selectedCount,
	onCopy,
	fileTreeData,
	selectedPaths,
	onSelect,
	onRefresh,
	isLoading,
}) => {
	// Ref for the vscode-tree element to update its data in place
	const [userInstructions, setUserInstructions] = useState('')
	// State for search query
	const [searchQuery, setSearchQuery] = useState('')
	const treeRef = useRef<any>(null)

	// State for tracking double-clicks
	const [lastClickedItem, setLastClickedItem] = useState<string | null>(null)
	const [lastClickTime, setLastClickTime] = useState<number>(0)

	// Initialize tree data when fileTreeData loads or searchQuery changes
	useEffect(() => {
		if (treeRef.current) {
			// Filter based on search query, then generate tree with actions & decorations
			const baseItems = searchQuery
				? filterTreeData(fileTreeData, searchQuery)
				: fileTreeData
			const initialData = transformTreeData(baseItems, selectedPaths)
			treeRef.current.data = initialData
		}
	}, [fileTreeData, searchQuery])

	// Update only actions & decorations when selection changes, preserving expanded states
	useEffect(() => {
		if (treeRef.current) {
			const items: VscodeTreeItem[] = treeRef.current.data

			// Recursive update of actions & decorations in place
			const updateItems = (nodes: VscodeTreeItem[]) => {
				for (const node of nodes) {
					const isSelected = selectedPaths.has(node.value)
					// Update action icon
					node.actions = [
						{
							icon: isSelected ? 'close' : 'add',
							actionId: 'toggle-select',
							tooltip: isSelected ? 'Deselect' : 'Select',
						},
					]
					// Update decorations (leaf or folder)
					if (node.subItems && node.subItems.length > 0) {
						updateItems(node.subItems)
						const allDesc = getAllDescendantPaths(node).filter(
							(p) => p !== node.value,
						)
						const selCount = allDesc.filter((p) => selectedPaths.has(p)).length
						if (selCount === allDesc.length && allDesc.length > 0) {
							node.decorations = [
								{ content: 'F', color: 'var(--vscode-testing-iconPassed)' },
							]
						} else if (selCount > 0) {
							node.decorations = [
								{ content: 'H', color: 'var(--vscode-testing-iconQueued)' },
							]
						} else if (selectedPaths.has(node.value)) {
							node.decorations = [
								{ content: 'F', color: 'var(--vscode-testing-iconPassed)' },
							]
						} else {
							node.decorations = undefined
						}
					} else {
						node.decorations = isSelected
							? [{ content: 'F', color: 'var(--vscode-testing-iconPassed)' }]
							: undefined
					}
				}
			}

			updateItems(items)
			// Trigger tree update
			treeRef.current.data = [...items]
		}
	}, [selectedPaths])

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
			const item = event.detail.item as VscodeTreeItem

			if (actionId === 'toggle-select' && item?.value) {
				const newSelectedPaths = new Set(selectedPaths)
				const path = item.value
				const isCurrentlySelected = newSelectedPaths.has(path)

				// Check if it's a folder (has subItems)
				if (item.subItems && item.subItems.length > 0) {
					// It's a folder - apply recursive logic
					const allPaths = getAllDescendantPaths(item) // Includes the folder itself

					if (isCurrentlySelected) {
						// Deselecting the folder and all its descendants
						for (const p of allPaths) {
							newSelectedPaths.delete(p)
						}
					} else {
						// Selecting the folder and all its descendants
						for (const p of allPaths) {
							newSelectedPaths.add(p)
						}
					}
				} else {
					// It's a file - simple toggle
					if (isCurrentlySelected) {
						newSelectedPaths.delete(path)
					} else {
						newSelectedPaths.add(path)
					}
				}

				// Notify parent with the updated set
				onSelect(newSelectedPaths)
			}
		},
		// Include getAllDescendantPaths in dependency array if it were not defined
		// outside the component, but since it is, only selectedPaths and onSelect matter.
		[selectedPaths, onSelect],
	)

	// Handle tree item selection with double-click detection
	const handleTreeSelect = useCallback(
		(event: VscTreeSelectEvent) => {
			const item = event.detail as VscodeTreeItem
			if (!item?.value) return

			const clickedPath = item.value
			const currentTime = Date.now()

			// Check if this is a double-click (same item clicked within 500ms)
			if (
				lastClickedItem === clickedPath &&
				currentTime - lastClickTime < 500
			) {
				// It's a double-click - determine if it's a file or folder
				if (!item.subItems || item.subItems.length === 0) {
					// It's a file, send message to open it
					const vscode = getVsCodeApi()
					vscode.postMessage({
						command: 'openFile',
						payload: { filePath: clickedPath },
					})
				}

				// Reset tracking after processing double-click
				setLastClickedItem(null)
				setLastClickTime(0)
			} else {
				// It's a single click - update tracking
				setLastClickedItem(clickedPath)
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
			<div>Selected files/folders: {selectedCount}</div>
			<vscode-divider style={{ height: '5px', color: 'red' }} />

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

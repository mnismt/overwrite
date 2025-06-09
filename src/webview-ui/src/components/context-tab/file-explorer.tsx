import { useCallback, useEffect, useRef, useState } from 'react'
import type {
	VscTreeActionEvent,
	VscTreeSelectEvent,
} from '@vscode-elements/elements/dist/vscode-tree/vscode-tree'
import type { VscodeTreeItem } from '../../../../types'
import { getVsCodeApi } from '../../utils/vscode'
import {
	filterTreeData,
	formatTokenCount,
	getAllDescendantPaths,
	transformTreeData,
} from './utils'

interface FileExplorerProps {
	fileTreeData: VscodeTreeItem[]
	selectedUris: Set<string>
	onSelect: (uris: Set<string>) => void
	isLoading: boolean
	searchQuery: string
	onSearchChange: (query: string) => void
	actualTokenCounts: Record<string, number>
}

const FileExplorer: React.FC<FileExplorerProps> = ({
	fileTreeData,
	selectedUris,
	onSelect,
	isLoading,
	searchQuery,
	onSearchChange,
	actualTokenCounts,
}) => {
	// Ref for the vscode-tree element to update its data in place
	const treeRef = useRef<any>(null)

	// State for tracking double-clicks
	const [lastClickedItem, setLastClickedItem] = useState<string | null>(null)
	const [lastClickTime, setLastClickTime] = useState<number>(0)

	// Function to merge previous open state into new tree items
	const mergeOpenState = useCallback(
		(
			prevItems: VscodeTreeItem[],
			newItems: VscodeTreeItem[],
		): VscodeTreeItem[] => {
			// Map previous items by value
			const prevMap = new Map<string, VscodeTreeItem>()
			for (const item of prevItems) {
				prevMap.set(item.value, item)
			}
			// Recursive merge with depth tracking
			const mergeItem = (item: VscodeTreeItem, depth = 0): VscodeTreeItem => {
				const prev = prevMap.get(item.value)
				// For first level (depth 0), default to open; otherwise default to closed
				const openState = prev?.open ?? depth === 0
				const merged: VscodeTreeItem = { ...item, open: openState }
				if (item.subItems) {
					merged.subItems = item.subItems.map((subItem) =>
						mergeItem(subItem, depth + 1),
					)
				}
				return merged
			}
			return newItems.map((item) => mergeItem(item, 0))
		},
		[],
	)

	// Initialize tree data with search filtering and transformations
	useEffect(() => {
		if (treeRef.current) {
			// Filter based on search query, then generate tree with basic structure
			const baseItems = searchQuery
				? filterTreeData(fileTreeData, searchQuery)
				: fileTreeData
			// Transform data with actions/decorations based on current selection
			const transformed = transformTreeData(baseItems, selectedUris)
			// Preserve expansion (open) state from previous data
			const dataToSet = treeRef.current.data
				? mergeOpenState(treeRef.current.data as VscodeTreeItem[], transformed)
				: transformed
			treeRef.current.data = dataToSet
		}
	}, [fileTreeData, searchQuery, mergeOpenState])

	// Update only actions & decorations when selection changes
	useEffect(() => {
		if (treeRef.current) {
			const items: VscodeTreeItem[] = treeRef.current.data

			const updateItems = (nodes: VscodeTreeItem[]) => {
				for (const node of nodes) {
					const isSelected = selectedUris.has(node.value)

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
							(uri) => selectedUris.has(uri),
						).length

						// Determine F/H selection status and set appropriate actions
						if (
							selectedChildDescendantsCount === childDescendants.length &&
							childDescendants.length > 0
						) {
							folderDecorations.push({
								content: 'F',
								color: 'var(--vscode-testing-iconPassed)',
							})
							// For fully selected folders, show close (deselect all) action
							node.actions = [
								{
									icon: 'close',
									actionId: 'toggle-select',
									tooltip: 'Deselect all',
								},
							]
						} else if (selectedChildDescendantsCount > 0) {
							folderDecorations.push({
								content: 'H',
								color: 'var(--vscode-testing-iconQueued)',
							})
							// For half-selected folders, show both add (select all) and close (deselect all) actions
							node.actions = [
								{
									icon: 'add',
									actionId: 'toggle-select',
									tooltip: 'Select all',
								},
								{
									icon: 'close',
									actionId: 'deselect-all',
									tooltip: 'Deselect all selected',
								},
							]
						} else if (selectedUris.has(node.value)) {
							// Folder itself is selected (e.g., an empty selected folder)
							folderDecorations.push({
								content: 'F',
								color: 'var(--vscode-testing-iconPassed)',
							})
							node.actions = [
								{
									icon: 'close',
									actionId: 'toggle-select',
									tooltip: 'Deselect',
								},
							]
						} else {
							// Empty folder with no selections
							node.actions = [
								{
									icon: 'add',
									actionId: 'toggle-select',
									tooltip: 'Select all',
								},
							]
						}

						// Calculate total tokens for selected files within this folder
						let folderTotalTokens = 0
						for (const descendantUri of allDescendants) {
							if (
								selectedUris.has(descendantUri) &&
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
						node.actions = [
							{
								icon: isSelected ? 'close' : 'add',
								actionId: 'toggle-select',
								tooltip: isSelected ? 'Deselect' : 'Select',
							},
						]
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
	}, [selectedUris, actualTokenCounts])

	// Handler for clicking the action icon - Toggles ONLY the clicked item
	// Updated: Handles recursive selection/deselection for folders
	const handleTreeAction = useCallback(
		(event: VscTreeActionEvent) => {
			const actionId = event.detail.actionId
			const item = event.detail.item as VscodeTreeItem // item.value is a URI string

			if (
				(actionId === 'toggle-select' || actionId === 'deselect-all') &&
				item?.value
			) {
				const newSelectedUris = new Set(selectedUris)
				const uri = item.value // This is a URI string
				const isCurrentlySelected = newSelectedUris.has(uri)

				if (actionId === 'deselect-all') {
					// Deselect all selected descendants (for half-selected folders)
					if (item.subItems && item.subItems.length > 0) {
						const allUris = getAllDescendantPaths(item) // Get all descendants
						// Only deselect URIs that are currently selected
						for (const u of allUris) {
							if (newSelectedUris.has(u)) {
								newSelectedUris.delete(u)
							}
						}
					}
				} else if (actionId === 'toggle-select') {
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
				}

				// Notify parent with the updated set
				onSelect(newSelectedUris)
			}
		},
		[selectedUris, onSelect],
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
				// For now, we assume files won't have subItems.
				if (!item.subItems || item.subItems.length === 0) {
					// It's a file, send message to open it
					const vscode = getVsCodeApi()
					vscode.postMessage({
						command: 'openFile',
						payload: { fileUri: clickedUri },
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
		<>
			{/* File Tree Area */}
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
		</>
	)
}

export default FileExplorer
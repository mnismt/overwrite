import type { VscTreeActionEvent } from '@vscode-elements/elements/dist/vscode-tree/vscode-tree'
import { useCallback, useEffect, useRef } from 'react'
import type { VscodeTreeItem } from '../../../types' // Corrected path

interface ContextTabProps {
	selectedCount: number
	userInstructions: string
	onUserInstructionsChange: (value: string) => void
	onCopy: (includeXml: boolean) => void
	fileTreeData: VscodeTreeItem[]
	selectedPaths: Set<string> // For displaying/managing selection in tree
	onSelect: (paths: Set<string>) => void // Handler for selection changes
	onRefresh: () => void // Handler for refresh button
	isLoading: boolean // To show loading state
}

// Helper function to recursively gather all descendant paths
const getAllDescendantPaths = (item: VscodeTreeItem): string[] => {
	const paths = [item.value]
	if (item.subItems) {
		for (const sub of item.subItems) {
			paths.push(...getAllDescendantPaths(sub))
		}
	}
	return paths
}

// Helper function to add decorations based on selection state
const addDecorationsToTree = (
	items: VscodeTreeItem[],
	selectedPaths: Set<string>,
): VscodeTreeItem[] => {
	return items.map((item) => {
		const decoratedItem = { ...item }

		if (decoratedItem.subItems && decoratedItem.subItems.length > 0) {
			// First, process children
			decoratedItem.subItems = addDecorationsToTree(
				decoratedItem.subItems,
				selectedPaths,
			)

			// Then calculate decoration for the parent
			const allDescendants = getAllDescendantPaths(decoratedItem)
			// Exclude the item itself when checking children status
			const descendantPaths = allDescendants.filter(
				(p) => p !== decoratedItem.value,
			)
			const selectedDescendantsCount = descendantPaths.filter((p) =>
				selectedPaths.has(p),
			).length

			// Clear existing decorations before potentially adding new ones
			decoratedItem.decorations = undefined

			if (
				selectedDescendantsCount === descendantPaths.length &&
				descendantPaths.length > 0
			) {
				// If all children are selected, mark parent as Fully selected ('F')
				// Only mark if the parent itself is also selected implicitly or explicitly
				if (selectedPaths.has(decoratedItem.value)) {
					decoratedItem.decorations = [
						{ content: 'F', color: 'var(--vscode-testing-iconPassed)' }, // Green
					]
				} else {
					// If children are full but parent isn't selected, mark as Half ('H')
					// This might happen if parent was deselected but children remained
					decoratedItem.decorations = [
						{ content: 'H', color: 'var(--vscode-testing-iconQueued)' }, // Yellow
					]
				}
			} else if (selectedDescendantsCount > 0) {
				// If some children are selected, mark as Half selected ('H')
				decoratedItem.decorations = [
					{ content: 'H', color: 'var(--vscode-testing-iconQueued)' }, // Yellow
				]
			} else if (selectedPaths.has(decoratedItem.value)) {
				// If no children are selected, but the item itself is, mark as Fully selected ('F')
				// This applies to selected files or empty selected folders
				decoratedItem.decorations = [
					{ content: 'F', color: 'var(--vscode-testing-iconPassed)' }, // Green
				]
			}
		} else {
			// Leaf nodes (files): Mark 'F' if selected
			decoratedItem.decorations = selectedPaths.has(decoratedItem.value)
				? [{ content: 'F', color: 'var(--vscode-testing-iconPassed)' }] // Green
				: undefined
		}

		return decoratedItem
	})
}

// Helper function to recursively add actions to tree data
const addActionsToTree = (
	items: VscodeTreeItem[],
	selectedPaths: Set<string>,
): VscodeTreeItem[] => {
	return items.map((item) => {
		const isSelected = selectedPaths.has(item.value)
		const selectAction = {
			icon: isSelected ? 'close' : 'add',
			actionId: 'toggle-select',
			tooltip: isSelected ? 'Deselect' : 'Select',
		}

		const newItem: VscodeTreeItem = {
			...item,
			selected: false, // Let decoration/action icon show state
			actions: [selectAction],
			// Ensure icons are defined if not provided
			icons: item.icons ?? {
				branch: 'folder',
				open: 'folder-opened',
				leaf: 'file',
			},
		}

		if (item.subItems && item.subItems.length > 0) {
			newItem.subItems = addActionsToTree(item.subItems, selectedPaths)
		}
		return newItem
	})
}

// Combine Action adding and Decoration adding
const transformTreeData = (
	items: VscodeTreeItem[],
	selectedPaths: Set<string>,
): VscodeTreeItem[] => {
	const itemsWithActions = addActionsToTree(items, selectedPaths)
	return addDecorationsToTree(itemsWithActions, selectedPaths)
}

const ContextTab: React.FC<ContextTabProps> = ({
	selectedCount,
	userInstructions,
	onUserInstructionsChange,
	onCopy,
	fileTreeData,
	selectedPaths,
	onSelect,
	onRefresh,
	isLoading,
}) => {
	// Ref for the vscode-tree element to update its data in place
	const treeRef = useRef<any>(null)

	// Initialize tree data when fileTreeData loads
	useEffect(() => {
		if (treeRef.current) {
			// Generate initial tree with actions & decorations
			const initialData = transformTreeData(fileTreeData, selectedPaths)
			treeRef.current.data = initialData
		}
	}, [fileTreeData])

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
	const handleCopyContextClick = useCallback(() => onCopy(false), [onCopy])
	const handleCopyContextXmlClick = useCallback(() => onCopy(true), [onCopy])

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

	return (
		<div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
			{/* --- Explorer Top Bar --- */}
			<div
				style={{ display: 'flex', marginBottom: '10px', alignItems: 'center' }}
			>
				<vscode-button onClick={handleRefreshClick} disabled={isLoading}>
					<span slot="start" className="codicon codicon-refresh" />
					{isLoading ? 'Loading...' : 'Refresh'}
				</vscode-button>
				<vscode-textfield
					placeholder="Search files..."
					style={{ marginLeft: '10px', flexGrow: 1 }}
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
					rows={5}
					placeholder="Enter instructions for the AI..."
					value={userInstructions}
					onChange={(e) => {
						const target = e.target as HTMLTextAreaElement
						onUserInstructionsChange(target.value)
					}}
					style={{ marginTop: '5px' }}
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

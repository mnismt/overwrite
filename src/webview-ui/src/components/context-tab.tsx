import type {
	TreeItem,
	VscTreeActionEvent,
} from '@vscode-elements/elements/dist/vscode-tree/vscode-tree'
import { useCallback, useEffect, useRef } from 'react'
import type { VscodeTreeItem } from '../../../types'

interface ContextTabProps {
	selectedCount: number
	userInstructions: string
	onUserInstructionsChange: (value: string) => void
	onCopy: (includeXml: boolean) => void
	fileTreeData: VscodeTreeItem[]
	selectedPaths: Set<string>
	onSelect: (paths: Set<string>) => void
	onRefresh: () => void
	isLoading: boolean
}

const ContextTab: React.FC<ContextTabProps> = ({
	fileTreeData,
	selectedPaths,
	onSelect,
	onRefresh,
	isLoading,
	userInstructions,
	onUserInstructionsChange,
	onCopy,
	selectedCount,
}) => {
	// Ref for the tree component
	const treeRef = useRef<any>(null)

	// Helper: get all descendant paths
	const getAllDescendantPaths = (item: VscodeTreeItem): string[] => {
		const paths = [item.value]
		if (item.subItems) {
			for (const sub of item.subItems) {
				paths.push(...getAllDescendantPaths(sub))
			}
		}
		return paths
	}

	// Update actions and decorations in place
	const updateTreeItems = (items: VscodeTreeItem[], selected: Set<string>) => {
		for (const item of items) {
			const isSelected = selected.has(item.value)
			item.actions = [
				{
					icon: isSelected ? 'close' : 'add',
					actionId: 'toggle-select',
					tooltip: isSelected ? 'Deselect' : 'Select',
				},
			]
			item.icons = item.icons ?? {
				branch: 'folder',
				open: 'folder-opened',
				leaf: 'file',
			}

			// Decorations logic
			if (item.subItems) {
				updateTreeItems(item.subItems, selected)
				// compute children selection
				const childPaths = getAllDescendantPaths(item).filter(
					(p) => p !== item.value,
				)
				const selCount = childPaths.filter((p) => selected.has(p)).length
				if (selCount === childPaths.length && childPaths.length > 0) {
					item.decorations = [
						{ content: 'F', color: 'var(--vscode-testing-iconPassed)' },
					]
				} else if (selCount > 0) {
					item.decorations = [
						{ content: 'H', color: 'var(--vscode-testing-iconQueued)' },
					]
				} else if (isSelected) {
					item.decorations = [
						{ content: 'F', color: 'var(--vscode-testing-iconPassed)' },
					]
				} else {
					item.decorations = undefined
				}
			} else {
				item.decorations = isSelected
					? [{ content: 'F', color: 'var(--vscode-testing-iconPassed)' }]
					: undefined
			}
		}
	}

	// Initialize tree data on mount or fileTreeData change
	useEffect(() => {
		if (treeRef.current) {
			treeRef.current.data = fileTreeData as unknown as TreeItem[]
		}
	}, [fileTreeData])

	// Update actions/decorations when selection changes
	useEffect(() => {
		if (treeRef.current?.data) {
			// Mutate data
			updateTreeItems(treeRef.current.data as VscodeTreeItem[], selectedPaths)
			// Force tree to refresh without resetting open state
			treeRef.current.data = [...treeRef.current.data]
		}
	}, [selectedPaths])

	const handleRefreshClick = useCallback(() => onRefresh(), [onRefresh])
	const handleCopyContextClick = useCallback(() => onCopy(false), [onCopy])
	const handleCopyContextXmlClick = useCallback(() => onCopy(true), [onCopy])

	const handleTreeAction = useCallback(
		(event: VscTreeActionEvent) => {
			const actionId = event.detail.actionId
			const item = event.detail.item as VscodeTreeItem

			if (actionId === 'toggle-select' && item.value) {
				const newSet = new Set(selectedPaths)
				const path = item.value
				const current = newSet.has(path)

				if (item.subItems) {
					const all = getAllDescendantPaths(item)
					if (current) for (const p of all) newSet.delete(p)
					else for (const p of all) newSet.add(p)
				} else {
					current ? newSet.delete(path) : newSet.add(path)
				}
				onSelect(newSet)
			}
		},
		[selectedPaths, onSelect],
	)

	return (
		<div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
			<div style={{ display: 'flex', marginBottom: 10, alignItems: 'center' }}>
				<vscode-button onClick={handleRefreshClick} disabled={isLoading}>
					<span slot="start" className="codicon codicon-refresh" />
					{isLoading ? 'Loading...' : 'Refresh'}
				</vscode-button>
				<vscode-textfield
					placeholder="Search files..."
					style={{ marginLeft: 10, flexGrow: 1 }}
				>
					<span slot="start" className="codicon codicon-search" />
				</vscode-textfield>
			</div>
			<div style={{ flexGrow: 1, overflow: 'auto', marginBottom: 10 }}>
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
			<div
				style={{
					height: 1,
					marginTop: 4,
					marginBottom: 4,
					backgroundColor: 'var(--vscode-panel-border)',
				}}
			/>
			<div>Selected files/folders: {selectedCount}</div>
			<div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' }}>
				<label htmlFor="user-instructions">User Instructions:</label>
				<vscode-textarea
					id="user-instructions"
					resize="vertical"
					rows={5}
					placeholder="Enter instructions for the AI..."
					value={userInstructions}
					onChange={(e) =>
						onUserInstructionsChange((e.target as HTMLTextAreaElement).value)
					}
					style={{ marginTop: 5 }}
				/>
			</div>
			<div style={{ marginTop: 15, display: 'flex', gap: 10 }}>
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

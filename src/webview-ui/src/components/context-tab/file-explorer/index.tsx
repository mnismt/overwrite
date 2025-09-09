import type { VscTreeSelectEvent } from '@vscode-elements/elements/dist/vscode-tree/vscode-tree'
import React, {
	startTransition,
	useCallback,
	useDeferredValue,
	useMemo,
	useRef,
} from 'react'
import type { VscodeTreeItem } from '../../../../../types'
import { getVsCodeApi } from '../../../utils/vscode'
import { filterTreeData, getAllDescendantPaths } from '../utils'
import type { FolderSelectionState } from './row-decorations'
import TreeNode from './tree-node'

import { buildTreeIndex } from './tree-index'

interface FileExplorerProps {
	fileTreeData: VscodeTreeItem[]
	selectedUris: Set<string>
	onSelect: (uris: Set<string>) => void
	isLoading: boolean
	searchQuery: string
	actualTokenCounts: Record<string, number>
}

const FileExplorer: React.FC<FileExplorerProps> = ({
	fileTreeData,
	selectedUris,
	onSelect,
	isLoading,
	searchQuery,
	actualTokenCounts,
}) => {
	// Defer heavy recalculations when selection/token counts change massively
	const deferredSelectedUris = useDeferredValue(selectedUris)
	const deferredTokenCounts = useDeferredValue(actualTokenCounts)

	// Filtered items based on search
	const visibleItems = useMemo(() => {
		return searchQuery
			? filterTreeData(fileTreeData, searchQuery)
			: fileTreeData
	}, [fileTreeData, searchQuery])

	// Build index for current visible tree
	const index = useMemo(() => buildTreeIndex(visibleItems), [visibleItems])

	// Stable refs to avoid function identity changes and stale closures
	const selectedUrisRef = useRef(selectedUris)
	const indexRef = useRef(index)
	selectedUrisRef.current = selectedUris
	indexRef.current = index

	// Derived per-node metrics based on selection + tokens (single post-order pass)
	const { selectedCountMap, tokenTotalsMap } = useMemo(() => {
		const selectedCountMap = new Map<string, number>()
		const tokenTotalsMap = new Map<string, number>()
		for (const uri of index.postOrder) {
			const n = index.nodes.get(uri)!
			if (!n.isFolder) {
				const isSelected = deferredSelectedUris.has(uri)
				selectedCountMap.set(uri, isSelected ? 1 : 0)
				tokenTotalsMap.set(uri, isSelected ? deferredTokenCounts[uri] || 0 : 0)
			} else {
				let sc = 0
				let tt = 0
				for (const c of n.children) {
					sc += selectedCountMap.get(c) || 0
					tt += tokenTotalsMap.get(c) || 0
				}
				selectedCountMap.set(uri, sc)
				tokenTotalsMap.set(uri, tt)
			}
		}
		return { selectedCountMap, tokenTotalsMap }
	}, [index, deferredSelectedUris, deferredTokenCounts])

	// Selection helpers
	const toggleFile = useCallback(
		(uri: string) => {
			const next = new Set(selectedUrisRef.current)
			if (next.has(uri)) next.delete(uri)
			else next.add(uri)
			startTransition(() => onSelect(next))
		},
		[onSelect],
	)

	const selectAllInSubtree = useCallback(
		(uri: string) => {
			const node = indexRef.current.nodes.get(uri)
			if (!node) return
			// Yield to the browser, then perform heavy traversal in a task
			setTimeout(() => {
				const next = new Set(selectedUrisRef.current)
				for (const u of getAllDescendantPaths(node.item)) next.add(u)
				startTransition(() => onSelect(next))
			}, 0)
		},
		[onSelect],
	)

	const deselectAllInSubtree = useCallback(
		(uri: string) => {
			const node = indexRef.current.nodes.get(uri)
			if (!node) return
			setTimeout(() => {
				const next = new Set(selectedUrisRef.current)
				for (const u of getAllDescendantPaths(node.item)) next.delete(u)
				startTransition(() => onSelect(next))
			}, 0)
		},
		[onSelect],
	)

	const getFolderSelectionState = useCallback(
		(uri: string): FolderSelectionState => {
			const total = index.descendantFileCount.get(uri) || 0
			if (total === 0) return 'none'
			const selected = selectedCountMap.get(uri) || 0
			if (selected === 0) return 'none'
			return selected === total ? 'full' : 'partial'
		},
		[index, selectedCountMap],
	)

	const renderTreeItems = (
		items: VscodeTreeItem[],
		depth = 0,
	): React.ReactNode[] => {
		return items.map((item) => {
			const isFolder = !!(item.subItems && item.subItems.length > 0)
			const totalDescFiles = index.descendantFileCount.get(item.value) || 0
			const selectedDescFiles = selectedCountMap.get(item.value) || 0
			const folderState = isFolder
				? getFolderSelectionState(item.value)
				: 'none'
			const folderTokens = isFolder ? tokenTotalsMap.get(item.value) || 0 : 0
			const fileSelected = !isFolder && deferredSelectedUris.has(item.value)
			const fileTokens = !isFolder ? deferredTokenCounts[item.value] || 0 : 0
			const isOpen = depth === 0

			return (
				<TreeNode
					key={item.value}
					item={item}
					depth={depth}
					isFolder={isFolder}
					isOpen={isOpen}
					totalDescendantFiles={totalDescFiles}
					selectedDescendantFiles={selectedDescFiles}
					folderSelectionState={folderState}
					folderTokenTotal={folderTokens}
					fileIsSelected={fileSelected}
					fileTokenCount={fileTokens}
					onToggleFile={toggleFile}
					onSelectAllInSubtree={selectAllInSubtree}
					onDeselectAllInSubtree={deselectAllInSubtree}
					renderChildren={renderTreeItems}
				/>
			)
		})
	}

	// Handle actual double-clicks to open files in VS Code
	const handleTreeDoubleClick = useCallback((e: React.MouseEvent) => {
		const target = e.target as HTMLElement | null
		if (!target) return
		const itemEl = target.closest('vscode-tree-item') as HTMLElement | null
		if (!itemEl) return
		const uri = itemEl.getAttribute('data-uri')
		if (!uri) return
		// Only open if this is a file (not a folder)
		const node = indexRef.current.nodes.get(uri)
		if (!node || node.isFolder) return
		const vscode = getVsCodeApi()
		vscode.postMessage({ command: 'openFile', payload: { fileUri: uri } })
	}, [])

	return (
		<div className="flex-1 overflow-auto mb-2">
			{isLoading ? (
				<div className="flex justify-center items-center h-full">
					<vscode-progress-ring />
				</div>
			) : (
				<vscode-tree
					onDoubleClick={handleTreeDoubleClick}
					expand-mode="singleClick"
					indent-guides
				>
					{renderTreeItems(visibleItems)}
				</vscode-tree>
			)}
		</div>
	)
}

export default React.memo(FileExplorer)

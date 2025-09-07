import type { VscTreeSelectEvent } from '@vscode-elements/elements/dist/vscode-tree/vscode-tree'
import React, {
	startTransition,
	useCallback,
	useMemo,
	useRef,
	useState,
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
	// Double-click state for opening files
	const [lastClickedItem, setLastClickedItem] = useState<string | null>(null)
	const [lastClickTime, setLastClickTime] = useState<number>(0)

	// Filtered items based on search
	const visibleItems = useMemo(() => {
		return searchQuery
			? filterTreeData(fileTreeData, searchQuery)
			: fileTreeData
	}, [fileTreeData, searchQuery])

	// Build index for current visible tree
	const index = useMemo(() => buildTreeIndex(visibleItems), [visibleItems])

	// Let vscode-tree manage expansion state internally

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
				const isSelected = selectedUris.has(uri)
				selectedCountMap.set(uri, isSelected ? 1 : 0)
				tokenTotalsMap.set(uri, isSelected ? actualTokenCounts[uri] || 0 : 0)
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
	}, [index, selectedUris, actualTokenCounts])

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
			const next = new Set(selectedUrisRef.current)
			for (const u of getAllDescendantPaths(node.item)) next.add(u)
			startTransition(() => onSelect(next))
		},
		[onSelect],
	)

	const deselectAllInSubtree = useCallback(
		(uri: string) => {
			const node = indexRef.current.nodes.get(uri)
			if (!node) return
			const next = new Set(selectedUrisRef.current)
			for (const u of getAllDescendantPaths(node.item)) next.delete(u)
			startTransition(() => onSelect(next))
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
			const fileSelected = !isFolder && selectedUris.has(item.value)
			const fileTokens = !isFolder ? actualTokenCounts[item.value] || 0 : 0
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

	// Handle tree item selection with double-click detection (open on double-click for files)
	const handleTreeSelect = useCallback(
		(event: VscTreeSelectEvent) => {
			const last = event.detail.selectedItems?.at(-1) as unknown as
				| HTMLElement
				| undefined
			if (!last) return
			const clickedUri = last.getAttribute('data-uri') || ''
			if (!clickedUri) return
			const currentTime = Date.now()

			// If branch, rely on native expansion; selection handler continues

			// Double-click to open file
			if (lastClickedItem === clickedUri && currentTime - lastClickTime < 500) {
				const vscode = getVsCodeApi()
				vscode.postMessage({
					command: 'openFile',
					payload: { fileUri: clickedUri },
				})
				setLastClickedItem(null)
				setLastClickTime(0)
			} else {
				setLastClickedItem(clickedUri)
				setLastClickTime(currentTime)
			}
		},
		[lastClickedItem, lastClickTime],
	)

	return (
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
					onvsc-tree-select={handleTreeSelect}
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

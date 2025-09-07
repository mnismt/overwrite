import type { VscTreeSelectEvent } from '@vscode-elements/elements/dist/vscode-tree/vscode-tree'
import React, { startTransition, useCallback, useMemo, useState } from 'react'
import type { VscodeTreeItem } from '../../../../../types'
import { getVsCodeApi } from '../../../utils/vscode'
import { filterTreeData, getAllDescendantPaths } from '../utils'
import RowActions from './row-actions'
import RowDecorations, { type FolderSelectionState } from './row-decorations'

import { buildTreeIndex } from './tree-index'

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
			const next = new Set(selectedUris)
			if (next.has(uri)) next.delete(uri)
			else next.add(uri)
			startTransition(() => onSelect(next))
		},
		[selectedUris, onSelect],
	)

	const selectAllInSubtree = useCallback(
		(item: VscodeTreeItem) => {
			const next = new Set(selectedUris)
			for (const u of getAllDescendantPaths(item)) next.add(u)
			startTransition(() => onSelect(next))
		},
		[selectedUris, onSelect],
	)

	const deselectAllInSubtree = useCallback(
		(item: VscodeTreeItem) => {
			const next = new Set(selectedUris)
			for (const u of getAllDescendantPaths(item)) next.delete(u)
			startTransition(() => onSelect(next))
		},
		[selectedUris, onSelect],
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
			const label = item.label
			const totalDescFiles = index.descendantFileCount.get(item.value) || 0
			const selectedDescFiles = selectedCountMap.get(item.value) || 0
			const folderState = isFolder
				? getFolderSelectionState(item.value)
				: 'none'
			const folderTokens = isFolder ? tokenTotalsMap.get(item.value) || 0 : 0
			const fileSelected = !isFolder && selectedUris.has(item.value)
			const fileTokens = !isFolder ? actualTokenCounts[item.value] || 0 : 0

			return (
				<vscode-tree-item
					key={item.value}
					data-uri={item.value}
					open={depth === 0}
				>
					<div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
						<div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
							<span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
						</div>
						<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
							<RowActions
								isFolder={isFolder}
								totalDescendantFiles={totalDescFiles}
								selectedDescendantFiles={selectedDescFiles}
								onSelectAllInSubtree={() => selectAllInSubtree(item)}
								onDeselectAllInSubtree={() => deselectAllInSubtree(item)}
								fileIsSelected={fileSelected}
								onToggleFile={() => toggleFile(item.value)}
							/>
						</div>
						<div style={{ marginLeft: 'auto', display: 'flex' }}>
							<RowDecorations
								isFolder={isFolder}
								folderSelectionState={folderState}
								folderTokenTotal={folderTokens}
								fileIsSelected={fileSelected}
								fileTokenCount={fileTokens}
							/>
						</div>
					</div>
					{isFolder ? renderTreeItems(item.subItems!, depth + 1) : null}
				</vscode-tree-item>
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

			if (lastClickedItem === clickedUri && currentTime - lastClickTime < 500) {
				const isBranch =
					(last as unknown as { branch?: boolean }).branch === true
				if (!isBranch) {
					const vscode = getVsCodeApi()
					vscode.postMessage({
						command: 'openFile',
						payload: { fileUri: clickedUri },
					})
				}
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
				<vscode-tree onvsc-tree-select={handleTreeSelect} indent-guides>
					{renderTreeItems(visibleItems)}
				</vscode-tree>
			)}
		</div>
	)
}

export default React.memo(FileExplorer)

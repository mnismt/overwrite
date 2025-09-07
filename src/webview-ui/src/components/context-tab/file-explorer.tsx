import type { VscTreeSelectEvent } from '@vscode-elements/elements/dist/vscode-tree/vscode-tree'
import { useCallback, useMemo, useState } from 'react'
import type { VscodeTreeItem } from '../../../../types'
import { getVsCodeApi } from '../../utils/vscode'
import {
	filterTreeData,
	formatTokenCount,
	getAllDescendantPaths,
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
	actualTokenCounts,
}) => {
	// State for tracking double-clicks
	const [lastClickedItem, setLastClickedItem] = useState<string | null>(null)
	const [lastClickTime, setLastClickTime] = useState<number>(0)

	// Filtered items based on search
	const visibleItems = useMemo(() => {
		return searchQuery
			? filterTreeData(fileTreeData, searchQuery)
			: fileTreeData
	}, [fileTreeData, searchQuery])

	// --- Selection helpers ---
	const toggleFile = useCallback(
		(uri: string) => {
			const next = new Set(selectedUris)
			if (next.has(uri)) next.delete(uri)
			else next.add(uri)
			onSelect(next)
		},
		[selectedUris, onSelect],
	)

	const selectAllInSubtree = useCallback(
		(item: VscodeTreeItem) => {
			const next = new Set(selectedUris)
			for (const u of getAllDescendantPaths(item)) next.add(u)
			onSelect(next)
		},
		[selectedUris, onSelect],
	)

	const deselectAllInSubtree = useCallback(
		(item: VscodeTreeItem) => {
			const next = new Set(selectedUris)
			for (const u of getAllDescendantPaths(item)) next.delete(u)
			onSelect(next)
		},
		[selectedUris, onSelect],
	)

	// Small, transparent, rounded action button used inside the tree
	const MiniActionButton: React.FC<{
		icon: 'add' | 'close'
		title: string
		onPress: () => void
	}> = ({ icon, title, onPress }) => {
		const [hovered, setHovered] = useState(false)
		const style: React.CSSProperties = {
			background: hovered ? 'var(--vscode-list-hoverBackground)' : 'transparent',
			border: hovered ? '1px solid var(--vscode-list-hoverBackground)' : '1px solid transparent',
			color: 'var(--vscode-foreground)',
			borderRadius: 6,
			fontSize: 12,
			padding: '0 6px',
			height: 18,
			lineHeight: '16px',
			display: 'inline-flex',
			alignItems: 'center',
			justifyContent: 'center',
			cursor: 'pointer',
		}
		const symbol = icon === 'add' ? '+' : '×'
		return (
			<button
				type="button"
				title={title}
				aria-label={title}
				style={style}
				onMouseEnter={() => setHovered(true)}
				onMouseLeave={() => setHovered(false)}
				onMouseDown={(e) => {
					e.preventDefault()
					e.stopPropagation()
					onPress()
				}}
			>
				{symbol}
			</button>
		)
	}

	// --- Rendering helpers ---
	const renderDecorations = (item: VscodeTreeItem): React.ReactNode => {
		const isFolder = !!(item.subItems && item.subItems.length > 0)
		const parts: React.ReactNode[] = []

		if (isFolder) {
			const all = getAllDescendantPaths(item)
			const childrenOnly = all.filter((u) => u !== item.value)
			const selectedChildren = childrenOnly.filter((u) => selectedUris.has(u))

			if (childrenOnly.length > 0) {
				if (selectedChildren.length === childrenOnly.length) {
					parts.push(
						<span
							key="full"
							style={{ color: 'var(--vscode-testing-iconPassed)' }}
						>
							F
						</span>,
					)
				} else if (selectedChildren.length > 0) {
					parts.push(
						<span
							key="half"
							style={{ color: 'var(--vscode-testing-iconQueued)' }}
						>
							H
						</span>,
					)
				}
			}

			// Folder total tokens from selected files in subtree
			let folderTotalTokens = 0
			for (const u of all) {
				if (selectedUris.has(u) && actualTokenCounts[u] !== undefined) {
					folderTotalTokens += actualTokenCounts[u]
				}
			}
			if (folderTotalTokens > 0) {
				parts.push(
					<vscode-badge key="tok" variant="counter">
						{formatTokenCount(folderTotalTokens)}
					</vscode-badge>,
				)
			}
		} else {
			// File decorations
			if (selectedUris.has(item.value)) {
				parts.push(
					<span key="f" style={{ color: 'var(--vscode-testing-iconPassed)' }}>
						F
					</span>,
				)
				const t = actualTokenCounts[item.value] || 0
				parts.push(
					<vscode-badge key="tok" variant="counter">
						{formatTokenCount(t)}
					</vscode-badge>,
				)
			}
		}

		if (parts.length === 0) return null
		return <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>{parts}</div>
	}

	const renderActions = (item: VscodeTreeItem): React.ReactNode => {
		const isFolder = !!(item.subItems && item.subItems.length > 0)
		if (isFolder) {
			const all = getAllDescendantPaths(item)
			const childrenOnly = all.filter((u) => u !== item.value)
			const selectedChildrenCount = childrenOnly.filter((u) =>
				selectedUris.has(u),
			).length

			if (
				childrenOnly.length > 0 &&
				selectedChildrenCount === childrenOnly.length
			) {
				// fully selected: show deselect all
				return (
					<div style={{ display: 'flex', gap: 4 }}>
						<MiniActionButton
							icon="close"
							title="Deselect all"
							onPress={() => deselectAllInSubtree(item)}
						/>
					</div>
				)
			}

			if (selectedChildrenCount > 0) {
				// half selected: show select all + deselect all
				return (
					<div style={{ display: 'flex', gap: 4 }}>
						<MiniActionButton
							icon="close"
							title="Deselect all"
							onPress={() => deselectAllInSubtree(item)}
						/>
					</div>
				)
			}

			// none selected: show select all
			return (
				<div style={{ display: 'flex', gap: 4 }}>
					<MiniActionButton
						icon="add"
						title="Select all"
						onPress={() => selectAllInSubtree(item)}
					/>
				</div>
			)
		}

		// File: toggle select
		const isSelected = selectedUris.has(item.value)
		return (
			<div style={{ display: 'flex', gap: 4 }}>
				<MiniActionButton
					icon={isSelected ? 'close' : 'add'}
					title={isSelected ? 'Deselect' : 'Select'}
					onPress={() => toggleFile(item.value)}
				/>
			</div>
		)
	}

	const renderTreeItems = (
		items: VscodeTreeItem[],
		depth = 0,
	): React.ReactNode[] => {
		return items.map((item) => {
			const isFolder = !!(item.subItems && item.subItems.length > 0)
			const label = item.label
			return (
				<vscode-tree-item
					key={item.value}
					data-uri={item.value}
					open={depth === 0}
				>
					<div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								flex: 1,
								minWidth: 0,
							}}
						>
							{/* Left: label */}
							<span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
								{label}
							</span>
						</div>
						{/* Inline actions, badges aligned far right */}
						<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
							{renderActions(item)}
						</div>
						{/* Decorations pinned to the far right */}
						<div style={{ marginLeft: 'auto', display: 'flex' }}>
							{renderDecorations(item)}
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
				// Open only if it's a leaf (non-branch)
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

import React from 'react'

export default React.memo(FileExplorer)

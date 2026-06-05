import React, {
	startTransition,
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import type { VscodeTreeItem } from '../../../types'
import { getVsCodeApi } from '../../../utils/vscode'
import { FileTreeSkeleton, LoadingOverlay } from '../../loading'
import { filterTreeData, getAllDescendantPaths } from '../utils'
import { listFilesUnderUriRemote } from './list-files-under-uri'
import type { FolderSelectionState } from './row-decorations'
import { buildTreeIndex } from './tree-index'
import { folderNeedsLoad, isFolderItem } from './tree-merge'
import TreeNode from './tree-node'

interface FileExplorerProps {
	fileTreeData: VscodeTreeItem[]
	selectedUris: Set<string>
	onSelect: (uris: Set<string>) => void
	isLoading: boolean
	searchQuery: string
	actualTokenCounts: Record<string, number>
	treeTruncated?: boolean
	loadingFolderUris: Set<string>
	onLoadChildren: (parentUri: string) => void
}

type LoadingPhase = 'initial' | 'skeleton' | 'progressive' | 'complete'

const FileExplorer: React.FC<FileExplorerProps> = ({
	fileTreeData,
	selectedUris,
	onSelect,
	isLoading,
	searchQuery,
	actualTokenCounts,
	treeTruncated = false,
	loadingFolderUris,
	onLoadChildren,
}) => {
	const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('initial')
	const [isRefreshing, setIsRefreshing] = useState(false)
	const [, setPrevFileTreeData] = useState<VscodeTreeItem[]>([])
	const [expandedUris, setExpandedUris] = useState<Set<string>>(() => new Set())
	const [listingFolderUris, setListingFolderUris] = useState<Set<string>>(
		() => new Set(),
	)
	const [listingFileCounts, setListingFileCounts] = useState<
		Map<string, number>
	>(() => new Map())

	const deferredSelectedUris = useDeferredValue(selectedUris)
	const deferredTokenCounts = useDeferredValue(actualTokenCounts)

	useEffect(() => {
		if (fileTreeData.length > 0 && expandedUris.size === 0) {
			setExpandedUris(new Set(fileTreeData.map((r) => r.value)))
		}
	}, [fileTreeData, expandedUris.size])

	// Roots arrive shallow (no subItems) from the lazy `getWorkspaceRoots` API and
	// are seeded as expanded above, but expanding via state alone never fetches
	// their children. Auto-load children for any root that is expanded yet unloaded
	// so the initial render (and refresh, where root URIs persist in expandedUris)
	// populates without the user having to collapse and re-expand each root.
	useEffect(() => {
		for (const root of fileTreeData) {
			if (
				expandedUris.has(root.value) &&
				folderNeedsLoad(root) &&
				!loadingFolderUris.has(root.value)
			) {
				onLoadChildren(root.value)
			}
		}
	}, [fileTreeData, expandedUris, loadingFolderUris, onLoadChildren])

	useEffect(() => {
		if (isLoading) {
			if (fileTreeData.length > 0) {
				setIsRefreshing(true)
				setLoadingPhase('initial')
			} else {
				setIsRefreshing(false)
				setLoadingPhase('skeleton')
			}
		} else {
			if (fileTreeData.length > 0) {
				setLoadingPhase('progressive')
				setTimeout(() => {
					setLoadingPhase('complete')
					setIsRefreshing(false)
				}, 300)
			} else {
				setLoadingPhase('initial')
			}
			setPrevFileTreeData(fileTreeData)
		}
	}, [isLoading, fileTreeData.length])

	const visibleItems = useMemo(() => {
		return searchQuery
			? filterTreeData(fileTreeData, searchQuery)
			: fileTreeData
	}, [fileTreeData, searchQuery])

	const index = useMemo(() => buildTreeIndex(visibleItems), [visibleItems])
	const fullTreeIndex = useMemo(
		() => buildTreeIndex(fileTreeData),
		[fileTreeData],
	)

	const selectedUrisRef = useRef(selectedUris)
	const indexRef = useRef(index)
	const fullTreeIndexRef = useRef(fullTreeIndex)
	selectedUrisRef.current = selectedUris
	indexRef.current = index
	fullTreeIndexRef.current = fullTreeIndex

	const toggleFolderExpanded = useCallback(
		(uri: string) => {
			setExpandedUris((prev) => {
				const next = new Set(prev)
				if (next.has(uri)) {
					next.delete(uri)
				} else {
					next.add(uri)
					const item = fullTreeIndexRef.current.nodes.get(uri)?.item
					if (item && folderNeedsLoad(item)) {
						onLoadChildren(uri)
					}
				}
				return next
			})
		},
		[onLoadChildren],
	)

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
			setTimeout(async () => {
				setListingFolderUris((prev) => new Set(prev).add(uri))
				try {
					const { uris } = await listFilesUnderUriRemote(uri, (progress) => {
						setListingFileCounts((prev) => {
							const next = new Map(prev)
							next.set(uri, progress.filesFound)
							return next
						})
					})
					const next = new Set(selectedUrisRef.current)
					next.add(uri)
					for (const u of uris) next.add(u)
					startTransition(() => onSelect(next))
				} catch (err) {
					if (err instanceof Error && err.name === 'AbortError') return
					console.error('selectAllInSubtree failed:', err)
					const node = indexRef.current.nodes.get(uri)
					if (!node) return
					const next = new Set(selectedUrisRef.current)
					for (const u of getAllDescendantPaths(node.item)) next.add(u)
					startTransition(() => onSelect(next))
				} finally {
					setListingFolderUris((prev) => {
						const next = new Set(prev)
						next.delete(uri)
						return next
					})
					setListingFileCounts((prev) => {
						const next = new Map(prev)
						next.delete(uri)
						return next
					})
				}
			}, 0)
		},
		[onSelect],
	)

	const deselectAllInSubtree = useCallback(
		(uri: string) => {
			setTimeout(async () => {
				setListingFolderUris((prev) => new Set(prev).add(uri))
				try {
					const { uris } = await listFilesUnderUriRemote(uri, (progress) => {
						setListingFileCounts((prev) => {
							const next = new Map(prev)
							next.set(uri, progress.filesFound)
							return next
						})
					})
					const next = new Set(selectedUrisRef.current)
					next.delete(uri)
					for (const u of uris) next.delete(u)
					const node = indexRef.current.nodes.get(uri)
					if (node) {
						for (const u of getAllDescendantPaths(node.item)) next.delete(u)
					}
					startTransition(() => onSelect(next))
				} catch (err) {
					if (err instanceof Error && err.name === 'AbortError') return
					const node = indexRef.current.nodes.get(uri)
					if (!node) return
					const next = new Set(selectedUrisRef.current)
					for (const u of getAllDescendantPaths(node.item)) next.delete(u)
					startTransition(() => onSelect(next))
				} finally {
					setListingFolderUris((prev) => {
						const next = new Set(prev)
						next.delete(uri)
						return next
					})
					setListingFileCounts((prev) => {
						const next = new Map(prev)
						next.delete(uri)
						return next
					})
				}
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
			const isFolder = isFolderItem(item)
			const totalDescFiles = index.descendantFileCount.get(item.value) || 0
			const selectedDescFiles = selectedCountMap.get(item.value) || 0
			const folderState = isFolder
				? getFolderSelectionState(item.value)
				: 'none'
			const folderTokens = isFolder ? tokenTotalsMap.get(item.value) || 0 : 0
			const fileSelected = !isFolder && deferredSelectedUris.has(item.value)
			const fileTokens = !isFolder ? deferredTokenCounts[item.value] || 0 : 0
			const isOpen = expandedUris.has(item.value)
			const isListingFiles = listingFolderUris.has(item.value)
			const listingFileCount = listingFileCounts.get(item.value) ?? 0

			return (
				<TreeNode
					key={item.value}
					item={item}
					depth={depth}
					isFolder={isFolder}
					isOpen={isOpen}
					isLoadingChildren={loadingFolderUris.has(item.value)}
					isListingFiles={isListingFiles}
					listingFileCount={listingFileCount}
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

	const handleTreeClick = useCallback(
		(e: React.MouseEvent) => {
			const target = e.target as HTMLElement | null
			if (!target) return
			if (target.closest('button')) return

			const itemEl = target.closest(
				'vscode-tree-item[data-uri]',
			) as HTMLElement | null
			if (!itemEl) return
			const uri = itemEl.getAttribute('data-uri')
			if (!uri) return

			const node = fullTreeIndexRef.current.nodes.get(uri)
			if (!node?.isFolder) return

			toggleFolderExpanded(uri)
		},
		[toggleFolderExpanded],
	)

	const handleTreeDoubleClick = useCallback((e: React.MouseEvent) => {
		const target = e.target as HTMLElement | null
		if (!target) return
		const itemEl = target.closest('vscode-tree-item') as HTMLElement | null
		if (!itemEl) return
		const uri = itemEl.getAttribute('data-uri')
		if (!uri) return
		const node = indexRef.current.nodes.get(uri)
		if (!node || node.isFolder) return
		const vscode = getVsCodeApi()
		vscode.postMessage({ command: 'openFile', payload: { fileUri: uri } })
	}, [])

	const renderContent = () => {
		switch (loadingPhase) {
			case 'initial':
				return (
					<div className="flex justify-center items-center h-full min-h-32">
						<vscode-progress-ring />
					</div>
				)

			case 'skeleton':
				return <FileTreeSkeleton itemCount={15} className="px-2" />

			case 'progressive':
			case 'complete':
				return (
					<div
						className={`tree-container ${loadingPhase === 'complete' ? 'loaded' : 'loading'}`}
					>
						{treeTruncated ? (
							<p className="text-warn-border bg-warn-bg text-xs px-2 py-1 mb-1 rounded border border-warn-border">
								File tree was truncated due to size limits. Expand folders to
								load more, or add exclusions in Settings.
							</p>
						) : null}
						{searchQuery ? (
							<p className="text-muted text-xs px-2 mb-1">
								Search only includes expanded and loaded folders.
							</p>
						) : null}
						<vscode-tree
							onClick={handleTreeClick}
							onDoubleClick={handleTreeDoubleClick}
							expand-mode="singleClick"
							indent-guides
						>
							{renderTreeItems(visibleItems)}
						</vscode-tree>
					</div>
				)

			default:
				return (
					<div className="flex justify-center items-center h-full">
						<vscode-progress-ring />
					</div>
				)
		}
	}

	return (
		<div className="flex-1 overflow-auto mb-2 relative">
			{renderContent()}

			<LoadingOverlay
				isVisible={isRefreshing && loadingPhase === 'initial'}
				message="Refreshing files..."
			/>
		</div>
	)
}

export default React.memo(FileExplorer)

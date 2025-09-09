import React from 'react'
import type { VscodeTreeItem } from '../../../../../types'
import RowActions from './row-actions'
import RowDecorations, { type FolderSelectionState } from './row-decorations'

interface TreeNodeProps {
	item: VscodeTreeItem
	depth: number
	isFolder: boolean
	isOpen?: boolean
	totalDescendantFiles: number
	selectedDescendantFiles: number
	folderSelectionState: FolderSelectionState
	folderTokenTotal: number
	fileIsSelected: boolean
	fileTokenCount: number
	onToggleFile: (uri: string) => void
	onSelectAllInSubtree: (uri: string) => void
	onDeselectAllInSubtree: (uri: string) => void
	renderChildren: (items: VscodeTreeItem[], depth: number) => React.ReactNode
}

const TreeNode: React.FC<TreeNodeProps> = ({
	item,
	depth,
	isFolder,
	isOpen = depth === 0,
	totalDescendantFiles,
	selectedDescendantFiles,
	folderSelectionState,
	folderTokenTotal,
	fileIsSelected,
	fileTokenCount,
	onToggleFile,
	onSelectAllInSubtree,
	onDeselectAllInSubtree,
	renderChildren,
}) => {
	return (
		<vscode-tree-item
			key={item.value}
			data-uri={item.value}
			{...(isOpen ? { open: true } : {})}
			className="w-full"
		>
			<vscode-icon name="folder" slot="icon-branch"></vscode-icon>
			<vscode-icon name="folder-opened" slot="icon-branch-opened"></vscode-icon>
			<vscode-icon name="file" slot="icon-leaf"></vscode-icon>
			<div className="flex items-center w-full">
				<div className="flex items-center flex-1 min-w-0">
					<span className="truncate">{item.label}</span>
				</div>
				<div className="flex items-center gap-2">
					<RowActions
						isFolder={isFolder}
						totalDescendantFiles={totalDescendantFiles}
						selectedDescendantFiles={selectedDescendantFiles}
						onSelectAllInSubtree={() => onSelectAllInSubtree(item.value)}
						onDeselectAllInSubtree={() => onDeselectAllInSubtree(item.value)}
						fileIsSelected={fileIsSelected}
						onToggleFile={() => onToggleFile(item.value)}
					/>
				</div>
				<RowDecorations
					isFolder={isFolder}
					folderSelectionState={folderSelectionState}
					folderTokenTotal={folderTokenTotal}
					fileIsSelected={fileIsSelected}
					fileTokenCount={fileTokenCount}
				/>
			</div>
			{isFolder ? renderChildren(item.subItems || [], depth + 1) : null}
		</vscode-tree-item>
	)
}

function areEqual(prev: TreeNodeProps, next: TreeNodeProps): boolean {
	return (
		prev.item.value === next.item.value &&
		prev.isFolder === next.isFolder &&
		prev.isOpen === next.isOpen &&
		prev.totalDescendantFiles === next.totalDescendantFiles &&
		prev.selectedDescendantFiles === next.selectedDescendantFiles &&
		prev.folderSelectionState === next.folderSelectionState &&
		prev.folderTokenTotal === next.folderTokenTotal &&
		prev.fileIsSelected === next.fileIsSelected &&
		prev.fileTokenCount === next.fileTokenCount &&
		prev.depth === next.depth
	)
}

export default React.memo(TreeNode, areEqual)

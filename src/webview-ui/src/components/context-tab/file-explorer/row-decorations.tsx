import React from 'react'
import { formatTokenCount } from '../utils'

export type FolderSelectionState = 'none' | 'partial' | 'full'

interface RowDecorationsProps {
	isFolder: boolean
	folderSelectionState?: FolderSelectionState
	folderTokenTotal?: number
	fileIsSelected?: boolean
	fileTokenCount?: number
}

const RowDecorations: React.FC<RowDecorationsProps> = React.memo(
	({
		isFolder,
		folderSelectionState,
		folderTokenTotal = 0,
		fileIsSelected = false,
		fileTokenCount = 0,
	}) => {
		const parts: React.ReactNode[] = []
		if (isFolder) {
			if (folderSelectionState === 'full') {
				parts.push(
					<vscode-icon
						key="full"
						name="circle-filled"
						title="Fully included"
						style={{
							color: 'var(--vscode-testing-iconPassed)',
							fontSize: '12px',
						}}
					/>,
				)
			} else if (folderSelectionState === 'partial') {
				parts.push(
					<vscode-icon
						key="partial"
						name="circle"
						title="Partially included"
						style={{
							color: 'var(--vscode-testing-iconQueued)',
							fontSize: '12px',
						}}
					/>,
				)
			}
			// Token indicator badge
			const showBadge = folderTokenTotal > 0
			if (showBadge) {
				parts.push(
					<div
						key="folder-token-indicator"
						style={{
							display: 'flex',
							alignItems: 'center',
							position: 'relative',
						}}
					>
						{showBadge ? <TokenBadge count={folderTokenTotal} /> : null}
					</div>,
				)
			}
		} else {
			// Only show token badge for selected files, no duplicate checkmark
			if (fileIsSelected) {
				const showBadge = fileTokenCount > 0
				if (showBadge) {
					parts.push(
						<div
							key="file-token-indicator"
							style={{
								display: 'flex',
								alignItems: 'center',
								position: 'relative',
							}}
						>
							<TokenBadge count={fileTokenCount} isSelected={true} />
						</div>,
					)
				}
			}
		}
		if (parts.length === 0) return null
		return <div className="flex items-center gap-4">{parts}</div>
	},
)
RowDecorations.displayName = 'RowDecorations'

const TokenBadge: React.FC<{ count: number; isSelected?: boolean }> = ({
	count,
	isSelected = false,
}) => {
	return (
		<p
			className="text-[10px]"
			style={{
				opacity: isSelected ? 0.8 : 0.6,
				color: isSelected ? 'var(--vscode-testing-iconPassed)' : 'inherit',
			}}
		>
			{formatTokenCount(count)}
		</p>
	)
}

export default RowDecorations

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
					<span
						key="full"
						title="Fully included"
						style={{
							width: 10,
							height: 10,
							borderRadius: 9999,
							background: 'var(--vscode-testing-iconPassed)',
							display: 'inline-block',
						}}
					/>,
				)
			} else if (folderSelectionState === 'partial') {
				parts.push(
					<span
						key="partial"
						title="Partially included"
						style={{
							width: 10,
							height: 10,
							borderRadius: 9999,
							display: 'inline-block',
							backgroundImage:
								'linear-gradient(90deg, var(--vscode-testing-iconQueued) 50%, transparent 50%)',
							border: '1px solid var(--vscode-descriptionForeground)',
							boxSizing: 'border-box',
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
							{showBadge ? <TokenBadge count={fileTokenCount} /> : null}
						</div>,
					)
				}
			}
		}
		if (parts.length === 0) return null
		return (
			<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
				{parts}
			</div>
		)
	},
)
RowDecorations.displayName = 'RowDecorations'

const TokenBadge: React.FC<{ count: number }> = ({ count }) => {
	return (
		<vscode-badge variant="counter">{formatTokenCount(count)}</vscode-badge>
	)
}

export default RowDecorations

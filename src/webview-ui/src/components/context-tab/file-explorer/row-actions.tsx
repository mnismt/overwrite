import React from 'react'
import MiniActionButton from './mini-action-button'

interface RowActionsProps {
	isFolder: boolean
	totalDescendantFiles?: number
	selectedDescendantFiles?: number
	onSelectAllInSubtree?: () => void
	onDeselectAllInSubtree?: () => void
	fileIsSelected?: boolean
	onToggleFile?: () => void
}

const wrapperStyle: React.CSSProperties = { display: 'flex', gap: 4 }

const RowActions: React.FC<RowActionsProps> = React.memo(
	({
		isFolder,
		totalDescendantFiles = 0,
		selectedDescendantFiles = 0,
		onSelectAllInSubtree,
		onDeselectAllInSubtree,
		fileIsSelected = false,
		onToggleFile,
	}) => {
		const onMouseDownCapture: React.MouseEventHandler<HTMLDivElement> = (e) => {
			// Handle the action early (capture) and stop the event so the tree doesn't toggle expand/collapse
			e.preventDefault()
			e.stopPropagation()
			if (isFolder) {
				if (selectedDescendantFiles > 0) {
					onDeselectAllInSubtree?.()
				} else {
					onSelectAllInSubtree?.()
				}
			} else {
				onToggleFile?.()
			}
		}

		const stop: React.MouseEventHandler<HTMLDivElement> = (e) => {
			// Block other tree interactions (click, dblclick, mouseup)
			e.preventDefault()
			e.stopPropagation()
		}

		if (isFolder) {
			if (
				totalDescendantFiles > 0 &&
				selectedDescendantFiles === totalDescendantFiles
			) {
				return (
					<div
						style={wrapperStyle}
						onMouseDownCapture={onMouseDownCapture}
						onMouseUpCapture={stop}
						onClickCapture={stop}
						onDoubleClickCapture={stop}
					>
						<MiniActionButton
							icon="close"
							title="Deselect all"
							onPress={() => onDeselectAllInSubtree?.()}
						/>
					</div>
				)
			}
			if (selectedDescendantFiles > 0) {
				return (
					<div
						style={wrapperStyle}
						onMouseDownCapture={onMouseDownCapture}
						onMouseUpCapture={stop}
						onClickCapture={stop}
						onDoubleClickCapture={stop}
					>
						<MiniActionButton
							icon="close"
							title="Deselect all"
							onPress={() => onDeselectAllInSubtree?.()}
						/>
					</div>
				)
			}
			return (
				<div
					style={wrapperStyle}
					onMouseDownCapture={onMouseDownCapture}
					onMouseUpCapture={stop}
					onClickCapture={stop}
					onDoubleClickCapture={stop}
				>
					<MiniActionButton
						icon="add"
						title="Select all"
						onPress={() => onSelectAllInSubtree?.()}
					/>
				</div>
			)
		}

		return (
			<div
				style={wrapperStyle}
				onMouseDownCapture={onMouseDownCapture}
				onMouseUpCapture={stop}
				onClickCapture={stop}
				onDoubleClickCapture={stop}
			>
				<MiniActionButton
					icon={fileIsSelected ? 'close' : 'add'}
					title={fileIsSelected ? 'Deselect' : 'Select'}
					onPress={() => onToggleFile?.()}
				/>
			</div>
		)
	},
)
RowActions.displayName = 'RowActions'

export default RowActions

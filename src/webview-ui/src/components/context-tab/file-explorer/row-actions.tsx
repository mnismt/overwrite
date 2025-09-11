import React from 'react'
import ActionButton from './action-button'

interface RowActionsProps {
	isFolder: boolean
	totalDescendantFiles?: number
	selectedDescendantFiles?: number
	onSelectAllInSubtree?: () => void
	onDeselectAllInSubtree?: () => void
	fileIsSelected?: boolean
	onToggleFile?: () => void
}

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

		const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
			<div
				className="flex gap-1"
				onMouseDownCapture={onMouseDownCapture}
				onMouseUpCapture={stop}
				onClickCapture={stop}
				onDoubleClickCapture={stop}
			>
				{children}
			</div>
		)

		// Decide which action button to render
		if (isFolder) {
			const showDeselect =
				totalDescendantFiles > 0 &&
				selectedDescendantFiles === totalDescendantFiles
					? true
					: selectedDescendantFiles > 0

			return (
				<Wrapper>
					{showDeselect ? (
						<ActionButton
							title="Deselect all"
							onPress={() => onDeselectAllInSubtree?.()}
							isSelected={true}
						/>
					) : (
						<ActionButton
							title="Select all"
							onPress={() => onSelectAllInSubtree?.()}
							isSelected={false}
						/>
					)}
				</Wrapper>
			)
		}

		return (
			<Wrapper>
				<ActionButton
					title={fileIsSelected ? 'Deselect' : 'Select'}
					onPress={() => onToggleFile?.()}
					isSelected={fileIsSelected}
				/>
			</Wrapper>
		)
	},
)
RowActions.displayName = 'RowActions'

export default RowActions

import React, { useState } from 'react'

interface MiniActionButtonProps {
	title: string
	onPress: () => void
	isSelected?: boolean
}

const ActionButton: React.FC<MiniActionButtonProps> = React.memo(
	({ title, onPress, isSelected = false }) => {
		const [hovered, setHovered] = useState(false)
		const [pressed, setPressed] = useState(false)

		// Determine the visual state and icon to show
		const getDisplayIcon = () => {
			if (isSelected) {
				return hovered ? 'close' : 'check'
			}
			return 'add'
		}

		// Icon color for better visibility
		const getIconColor = () => {
			if (isSelected) {
				return hovered
					? 'var(--vscode-errorForeground)'
					: 'var(--vscode-testing-iconPassed)'
			}
			return hovered 
				? 'var(--vscode-button-foreground)' 
				: 'var(--vscode-foreground)'
		}

		return (
			<button
				type="button"
				title={title}
				aria-label={title}
				className={`
					inline-flex items-center justify-center
					h-5 px-2 mx-2 rounded-md
					border-none outline-none cursor-pointer select-none
					text-xs text-button-foreground
					transition-all duration-100 ease-in-out
					${
						pressed
							? 'bg-button-hover'
							: hovered
								? 'bg-button'
								: 'bg-transparent'
					}
				`}
				onMouseEnter={() => setHovered(true)}
				onMouseDown={(e) => {
					e.preventDefault()
					e.stopPropagation()
					setPressed(true)
					onPress()
				}}
				onMouseUp={(e) => {
					e.preventDefault()
					e.stopPropagation()
					setPressed(false)
				}}
				onMouseLeave={() => {
					setHovered(false)
					setPressed(false)
				}}
				onClick={(e) => {
					e.preventDefault()
					e.stopPropagation()
				}}
				onDoubleClick={(e) => {
					e.preventDefault()
					e.stopPropagation()
				}}
			>
				<vscode-icon
					name={getDisplayIcon()}
					style={{
						color: getIconColor(),
					}}
					size={12}
				></vscode-icon>
			</button>
		)
	},
)
ActionButton.displayName = 'MiniActionButton'

export default ActionButton

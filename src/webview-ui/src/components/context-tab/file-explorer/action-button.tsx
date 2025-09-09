import React, { useState } from 'react'

interface MiniActionButtonProps {
	icon: 'add' | 'close'
	title: string
	onPress: () => void
}

const ActionButton: React.FC<MiniActionButtonProps> = React.memo(
	({ icon, title, onPress }) => {
		const [hovered, setHovered] = useState(false)
		const [pressed, setPressed] = useState(false)

		// Make buttons visually distinct from tree row hover using real button tokens
		const baseBorder = 'var(--vscode-button-background)'
		const baseBg = 'var(--vscode-button-background)'
		const baseBgHover = 'var(--vscode-button-hoverBackground)'
		const baseFg = 'var(--vscode-button-foreground)'

		const style: React.CSSProperties = {
			background: pressed ? baseBgHover : hovered ? baseBg : 'transparent',
			border: 'none',
			color: hovered || pressed ? baseFg : baseBorder,
			borderRadius: 6,
			fontSize: 12,
			margin: '0 8px',
			padding: '0 8px',
			height: 20,
			lineHeight: '18px',
			display: 'inline-flex',
			alignItems: 'center',
			justifyContent: 'center',
			cursor: 'pointer',
			userSelect: 'none',
			transition: 'background-color 120ms ease-in-out, color 120ms ease-in-out',
			outline: 'none',
		}

		const symbol = icon === 'add' ? '+' : '×'
		return (
			<button
				type="button"
				title={title}
				aria-label={title}
				style={style}
				onMouseEnter={() => setHovered(true)}
				onMouseDown={(e) => {
					// Trigger the action immediately but avoid affecting the tree item
					e.preventDefault()
					e.stopPropagation()
					setPressed(true)
					onPress()
				}}
				onMouseUp={(e) => {
					// Some trees toggle on mouseup; stop propagation here as well
					e.preventDefault()
					e.stopPropagation()
					setPressed(false)
				}}
				onMouseLeave={() => {
					setHovered(false)
					setPressed(false)
				}}
				onClick={(e) => {
					// Prevent the click from bubbling to the tree row which can toggle expand/collapse
					e.preventDefault()
					e.stopPropagation()
				}}
				onDoubleClick={(e) => {
					// Also guard against double-click expanding folders
					e.preventDefault()
					e.stopPropagation()
				}}
			>
				{symbol}
			</button>
		)
	},
)
ActionButton.displayName = 'MiniActionButton'

export default ActionButton

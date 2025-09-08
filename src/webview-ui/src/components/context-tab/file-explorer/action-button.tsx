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
		const [focused, setFocused] = useState(false)

		const style: React.CSSProperties = {
			// Use VS Code theme variables for full compatibility
			background: pressed
				? 'var(--vscode-list-activeSelectionBackground)'
				: hovered
					? 'var(--vscode-list-hoverBackground)'
					: 'transparent',
			border: focused
				? '1px solid var(--vscode-focusBorder)'
				: hovered
					? '1px solid var(--vscode-list-hoverBackground)'
					: '1px solid transparent',
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
			transition: 'background-color 120ms ease-in-out',
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
				onFocus={() => setFocused(true)}
				onBlur={() => setFocused(false)}
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

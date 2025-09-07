import React, { useState } from 'react'

interface MiniActionButtonProps {
	icon: 'add' | 'close'
	title: string
	onPress: () => void
}

const MiniActionButton: React.FC<MiniActionButtonProps> = React.memo(
	({ icon, title, onPress }) => {
		const [hovered, setHovered] = useState(false)
		const style: React.CSSProperties = {
			background: hovered
				? 'var(--vscode-list-hoverBackground)'
				: 'transparent',
			border: hovered
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
	},
)
MiniActionButton.displayName = 'MiniActionButton'

export default MiniActionButton

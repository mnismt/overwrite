import type React from 'react'
import { useCallback } from 'react'

// TODO: Define props interface (e.g., selectedCount, onCopy)
interface ContextTabProps {
	selectedCount: number
	userInstructions: string
	onUserInstructionsChange: (value: string) => void
	onCopy: (includeXml: boolean) => void
}

const ContextTab: React.FC<ContextTabProps> = ({
	selectedCount,
	userInstructions,
	onUserInstructionsChange,
	onCopy,
}) => {
	const handleCopy = useCallback(
		(includeXml: boolean) => () => {
			onCopy(includeXml)
			// TODO: Add visual feedback (e.g., temporary button text change)?
		},
		[onCopy],
	)

	const handleTextChange = useCallback(
		(event: React.SyntheticEvent) => {
			const target = event.target as HTMLTextAreaElement // Assuming vscode-textarea behaves like HTMLTextAreaElement
			onUserInstructionsChange(target.value)
		},
		[onUserInstructionsChange],
	)

	// Basic keydown handler for button accessibility
	const handleButtonKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLElement>, action: () => void) => {
			if (event.key === 'Enter' || event.key === ' ') {
				action()
			}
		},
		[],
	)

	return (
		<div>
			<p>
				Selected files/folders: <vscode-badge>{selectedCount}</vscode-badge>
			</p>
			<vscode-label
				htmlFor="user-instructions-textarea"
				style={{ display: 'block', marginBottom: '4px' }}
			>
				User Instructions:
			</vscode-label>
			<vscode-textarea
				id="user-instructions-textarea"
				placeholder="Enter instructions for the AI..."
				style={{ width: '100%' }}
				rows={8} // Increased rows a bit
				value={userInstructions}
				onInput={handleTextChange}
			/>
			<div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
				<vscode-button
					onClick={handleCopy(false)}
					onKeyDown={(e) => handleButtonKeyDown(e, handleCopy(false))}
				>
					Copy Context
				</vscode-button>
				<vscode-button
					onClick={handleCopy(true)}
					onKeyDown={(e) => handleButtonKeyDown(e, handleCopy(true))}
				>
					Copy Context + XML Instructions
				</vscode-button>
			</div>
		</div>
	)
}

export default ContextTab

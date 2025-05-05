import type React from 'react'
import { useCallback, useState } from 'react'

// TODO: Define props interface (e.g., onApply)
interface ApplyTabProps {
	onApply: (responseText: string) => void
}

const ApplyTab: React.FC<ApplyTabProps> = ({ onApply }) => {
	const [responseText, setResponseText] = useState('')

	const handleApply = useCallback(() => {
		console.log('Apply clicked')
		onApply(responseText)
		// TODO: Add visual feedback (e.g., progress indicator)
	}, [onApply, responseText])

	const handleTextChange = useCallback((event: React.SyntheticEvent) => {
		const target = event.target as HTMLTextAreaElement
		setResponseText(target.value)
	}, [])

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
			<vscode-label
				htmlFor="llm-response-textarea"
				style={{ display: 'block', marginBottom: '4px' }}
			>
				Paste LLM Response (XML Format):
			</vscode-label>
			<vscode-textarea
				id="llm-response-textarea"
				placeholder="Paste the full XML response from the AI here..."
				style={{ width: '100%' }}
				rows={15} // Make it taller
				value={responseText}
				onInput={handleTextChange}
			/>
			<div style={{ marginTop: '10px' }}>
				<vscode-button
					onClick={handleApply}
					onKeyDown={(e) => handleButtonKeyDown(e, handleApply)}
				>
					Preview & Apply Changes
				</vscode-button>
			</div>
			{/* TODO: Add area for feedback/status updates */}
		</div>
	)
}

export default ApplyTab

import type React from 'react'
import { useCallback, useEffect, useState } from 'react'

// Define types for apply results
interface ApplyResult {
	path: string
	action: string
	success: boolean
	message: string
}

interface ApplyChangeResponse {
	command: string
	success: boolean
	results?: ApplyResult[]
	errors?: string[]
}

// Props interface
interface ApplyTabProps {
	onApply: (responseText: string) => void
}

const ApplyTab: React.FC<ApplyTabProps> = ({ onApply }) => {
	const [responseText, setResponseText] = useState('')
	const [isApplying, setIsApplying] = useState(false)
	const [results, setResults] = useState<ApplyResult[] | null>(null)
	const [errors, setErrors] = useState<string[] | null>(null)

	// Handle apply button click
	const handleApply = useCallback(() => {
		if (!responseText.trim()) {
			setErrors(['Please paste an XML response first.'])
			return
		}

		setIsApplying(true)
		setResults(null)
		setErrors(null)
		onApply(responseText)
	}, [onApply, responseText])

	// Listen for apply changes result
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data as ApplyChangeResponse

			if (message.command === 'applyChangesResult') {
				setIsApplying(false)
				if (message.success) {
					setResults(message.results || [])
					setErrors(null)
				} else {
					setErrors(message.errors || ['Unknown error occurred'])
					setResults(null)
				}
			}
		}

		window.addEventListener('message', handleMessage)
		return () => window.removeEventListener('message', handleMessage)
	}, [])

	// Handle text changes
	const handleTextChange = useCallback((event: React.SyntheticEvent) => {
		const target = event.target as HTMLTextAreaElement
		setResponseText(target.value)
	}, [])

	// Button accessibility handler
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
				style={{ width: '100%', minHeight: '300px' }}
				rows={15}
				value={responseText}
				onInput={handleTextChange}
			/>
			<div style={{ marginTop: '10px' }}>
				<vscode-button
					onClick={handleApply}
					onKeyDown={(e) => handleButtonKeyDown(e, handleApply)}
					disabled={isApplying}
				>
					{isApplying ? 'Applying Changes...' : 'Preview & Apply Changes'}
				</vscode-button>
			</div>

			{/* Results section */}
			{(results || errors) && (
				<div style={{ marginTop: '20px' }}>
					<vscode-divider style={{ margin: '10px 0' }}></vscode-divider>
					<h3>Results:</h3>

					{/* Show errors if any */}
					{errors && errors.length > 0 && (
						<div style={{ marginBottom: '10px' }}>
							<h4 style={{ color: 'var(--vscode-errorForeground)' }}>
								Errors:
							</h4>
							<ul style={{ color: 'var(--vscode-errorForeground)' }}>
								{errors.map((error, index) => (
									<li key={index}>{error}</li>
								))}
							</ul>
						</div>
					)}

					{/* Show results if any */}
					{results && results.length > 0 && (
						<div>
							<h4>File Operations:</h4>
							<vscode-table>
								<vscode-table-header>
									<vscode-table-row>
										<vscode-table-header-cell>Path</vscode-table-header-cell>
										<vscode-table-header-cell>Action</vscode-table-header-cell>
										<vscode-table-header-cell>Status</vscode-table-header-cell>
										<vscode-table-header-cell>Message</vscode-table-header-cell>
									</vscode-table-row>
								</vscode-table-header>
								<vscode-table-body>
									{results.map((result, index) => (
										<vscode-table-row key={index}>
											<vscode-table-cell
												style={{
													whiteSpace: 'normal',
													verticalAlign: 'top',
													paddingTop: '8px',
													paddingBottom: '8px',
												}}
											>
												{result.path}
											</vscode-table-cell>
											<vscode-table-cell
												style={{
													verticalAlign: 'top',
													paddingTop: '8px',
													paddingBottom: '8px',
												}}
											>
												{result.action}
											</vscode-table-cell>
											<vscode-table-cell
												style={{
													verticalAlign: 'top',
													paddingTop: '8px',
													paddingBottom: '8px',
												}}
											>
												<vscode-badge
													variant={result.success ? 'counter' : 'default'}
													style={{
														color: result.success
															? 'var(--vscode-testing-iconPassed)'
															: 'var(--vscode-testing-iconFailed)',
													}}
												>
													{result.success ? 'Success' : 'Failed'}
												</vscode-badge>
											</vscode-table-cell>
											<vscode-table-cell
												style={{
													whiteSpace: 'normal',
													verticalAlign: 'top',
													paddingTop: '8px',
													paddingBottom: '8px',
												}}
											>
												{result.message}
											</vscode-table-cell>
										</vscode-table-row>
									))}
								</vscode-table-body>
							</vscode-table>
						</div>
					)}
				</div>
			)}
		</div>
	)
}

export default ApplyTab

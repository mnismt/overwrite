import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import type { ApplyChangeResponse, ApplyResult } from './types'
import ResponseTextarea from './response-textarea'
import ApplyActions from './apply-actions'
import ResultsDisplay from './results-display'

interface ApplyTabProps {
	onApply: (responseText: string) => void
}

const ApplyTab: React.FC<ApplyTabProps> = ({ onApply }) => {
	const [responseText, setResponseText] = useState('')
	const [isApplying, setIsApplying] = useState(false)
	const [results, setResults] = useState<ApplyResult[] | null>(null)
	const [errors, setErrors] = useState<string[] | null>(null)

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

	const handleTextChange = useCallback((event: React.SyntheticEvent) => {
		const target = event.target as HTMLTextAreaElement
		setResponseText(target.value)
	}, [])

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
			<ResponseTextarea
				responseText={responseText}
				onTextChange={handleTextChange}
			/>
			<ApplyActions
				isApplying={isApplying}
				onApply={handleApply}
				handleButtonKeyDown={handleButtonKeyDown}
			/>
			<ResultsDisplay results={results} errors={errors} />
		</div>
	)
}

export default ApplyTab

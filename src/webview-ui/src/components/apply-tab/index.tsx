import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import ApplyActions from './apply-actions'
import ResponseTextarea from './response-textarea'
import ResultsDisplay from './results-display'
import type { ApplyChangeResponse, ApplyResult } from './types'

interface ApplyTabProps {
	onApply: (responseText: string) => void
	onPreview: (responseText: string) => void
}

const ApplyTab: React.FC<ApplyTabProps> = ({ onApply, onPreview }) => {
	const [responseText, setResponseText] = useState('')
	const [isApplying, setIsApplying] = useState(false)
	const [isPreviewing, setIsPreviewing] = useState(false)
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

	const handlePreview = useCallback(() => {
		if (!responseText.trim()) {
			setErrors(['Please paste an XML response first.'])
			return
		}
		setIsPreviewing(true)
		setErrors(null)
		onPreview(responseText)
	}, [onPreview, responseText])

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

			if (message.command === 'previewChangesResult') {
				setIsPreviewing(false)
				if (!message.success) {
					setErrors(message.errors || ['Unknown error occurred'])
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
		<div className="py-2">
			<ResponseTextarea
				responseText={responseText}
				onTextChange={handleTextChange}
			/>
			<ApplyActions
				isApplying={isApplying}
				isPreviewing={isPreviewing}
				onPreview={handlePreview}
				onApply={handleApply}
				handleButtonKeyDown={handleButtonKeyDown}
			/>
			<ResultsDisplay results={results} errors={errors} />
		</div>
	)
}

export default ApplyTab

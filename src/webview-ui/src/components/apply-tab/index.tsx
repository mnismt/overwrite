import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import ApplyActions from './apply-actions'
import PreviewTable from './preview-table'
import ResponseTextarea from './response-textarea'
import ResultsDisplay from './results-display'
import type { ApplyChangeResponse, ApplyResult, PreviewData } from './types'

interface ApplyTabProps {
	onApply: (responseText: string) => void
	onPreview: (responseText: string) => void
	onApplyRow?: (responseText: string, rowIndex: number) => void
}

const ApplyTab: React.FC<ApplyTabProps> = ({
	onApply,
	onPreview,
	onApplyRow,
}) => {
	const [responseText, setResponseText] = useState('')
	const [isApplying, setIsApplying] = useState(false)
	const [isPreviewing, setIsPreviewing] = useState(false)
	const [results, setResults] = useState<ApplyResult[] | null>(null)
	const [errors, setErrors] = useState<string[] | null>(null)
	const [previewData, setPreviewData] = useState<PreviewData | null>(null)

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
		setPreviewData(null)
		onPreview(responseText)
	}, [onPreview, responseText])

	const handleApplyRow = useCallback(
		(rowIndex: number) => {
			if (!responseText.trim()) {
				setErrors(['Please paste an XML response first.'])
				return
			}
			if (onApplyRow) {
				onApplyRow(responseText, rowIndex)
			}
		},
		[onApplyRow, responseText],
	)

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
				if (message.success) {
					setPreviewData(message.previewData || null)
					setErrors(null)
				} else {
					setErrors(message.errors || ['Unknown error occurred'])
					setPreviewData(null)
				}
			}

			if (message.command === 'applyRowChangeResult') {
				// Handle individual row apply result similar to full apply
				if (message.success) {
					setResults(message.results || [])
					setErrors(null)
				} else {
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

			{/* Show preview table if we have preview data, otherwise show results */}
			{previewData ? (
				<PreviewTable
					previewData={previewData}
					onApplyRow={handleApplyRow}
					isApplying={isApplying}
				/>
			) : (
				<ResultsDisplay results={results} errors={errors} />
			)}
		</div>
	)
}

export default ApplyTab

import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getVsCodeApi } from '../../utils/vscode'
import ApplyActions from './apply-actions'
import { lintXmlText, preprocessXmlText } from './preprocess'
import PreviewTable from './preview-table'
import ResponseTextarea from './response-textarea'
import type {
	ApplyChangeResponse,
	ApplyResult,
	PreviewData,
	RowApplyResult,
} from './types'

interface ApplyTabProps {
	onApply: (responseText: string) => void
	onPreview: (responseText: string) => void
	onApplyRow?: (responseText: string, rowIndex: number) => void
	onPreviewRow?: (responseText: string, rowIndex: number) => void
}

const ApplyTab: React.FC<ApplyTabProps> = ({
	onApply,
	onPreview,
	onApplyRow,
	onPreviewRow,
}) => {
	const [responseText, setResponseText] = useState('')
	const [isApplying, setIsApplying] = useState(false)
	const [isPreviewing, setIsPreviewing] = useState(false)
	const operationLockRef = useRef(false) // Mutex to prevent concurrent operations
	const [previewData, setPreviewData] = useState<PreviewData | null>(null)
	const [lints, setLints] = useState<string[]>([])
	const [rowResults, setRowResults] = useState<RowApplyResult[] | null>(null)
	const [errors, setErrors] = useState<string[] | null>(null)

	// Track current request to prevent race conditions
	const currentRequestRef = useRef<{
		type: 'apply' | 'preview' | 'applyRow' | 'previewRow' | null
		timestamp: number
	}>({ type: null, timestamp: 0 })

	const handleApply = useCallback(() => {
		// Check mutex to prevent concurrent operations
		if (operationLockRef.current) {
			console.warn('[ApplyTab] Operation already in progress, ignoring request')
			return
		}

		const currentText = responseText.trim()
		if (!currentText) {
			setErrors(['Please paste an XML response first.'])
			return
		}

		operationLockRef.current = true
		const timestamp = Date.now()
		currentRequestRef.current = { type: 'apply', timestamp }

		setIsApplying(true)
		setErrors(null)
		setRowResults(null)
		// Don't clear previewData here - keep it for context in case of errors

		// Preprocess the text before sending
		const { text: cleaned, changes, issues } = preprocessXmlText(currentText)
		setLints([...new Set([...changes, ...issues])])
		onApply(cleaned)
	}, [onApply, responseText])

	const handlePreview = useCallback(() => {
		// Check mutex to prevent concurrent operations
		if (operationLockRef.current) {
			console.warn('[ApplyTab] Operation already in progress, ignoring request')
			return
		}

		const currentText = responseText.trim()
		if (!currentText) {
			setErrors(['Please paste an XML response first.'])
			return
		}

		operationLockRef.current = true
		const timestamp = Date.now()
		currentRequestRef.current = { type: 'preview', timestamp }

		setIsPreviewing(true)
		setErrors(null)
		setPreviewData(null)
		setRowResults(null)

		// Preprocess before previewing as well
		const { text: cleaned, changes, issues } = preprocessXmlText(currentText)
		setLints([...new Set([...changes, ...issues])])
		onPreview(cleaned)
	}, [onPreview, responseText])

	const handleApplyRow = useCallback(
		(rowIndex: number) => {
			if (!responseText.trim()) {
				setErrors(['Please paste an XML response first.'])
				return
			}
			if (onApplyRow) {
				const {
					text: cleaned,
					changes,
					issues,
				} = preprocessXmlText(responseText)
				setLints([...new Set([...changes, ...issues])])
				onApplyRow(cleaned, rowIndex)
			}
		},
		[onApplyRow, responseText],
	)

	const handlePreviewRow = useCallback(
		(rowIndex: number) => {
			if (!responseText.trim()) {
				setErrors(['Please paste an XML response first.'])
				return
			}
			if (onPreviewRow) {
				const {
					text: cleaned,
					changes,
					issues,
				} = preprocessXmlText(responseText)
				setLints([...new Set([...changes, ...issues])])
				onPreviewRow(cleaned, rowIndex)
			}
		},
		[onPreviewRow, responseText],
	)

	const handleApplyChangesMessage = (message: ApplyChangeResponse) => {
		// Validate this is the current request to prevent race conditions
		if (currentRequestRef.current.type !== 'apply') {
			console.debug('[ApplyTab] Ignoring stale apply response')
			operationLockRef.current = false // Release mutex even for stale requests
			return
		}

		currentRequestRef.current = { type: null, timestamp: 0 }
		operationLockRef.current = false // Release mutex
		setIsApplying(false)

		if (message.success) {
			const applyResults = message.results || []
			setErrors(null)

			// Create row-level results from apply results
			if (previewData && previewData.rows.length > 0) {
				const rowLevelResults = previewData.rows.map((row, idx) => {
					const result = applyResults[idx]
					return {
						rowIndex: idx,
						path: row.path,
						action: row.action,
						success: result?.success || false,
						message: result?.message || 'No result',
						isCascadeFailure: detectCascadeFailure(result, applyResults, idx),
					}
				})
				setRowResults(rowLevelResults)
			}

			// Trigger refresh after successful apply
			setTimeout(() => {
				const vscode = getVsCodeApi()
				vscode.postMessage({ command: 'refreshAfterApply' })
			}, 500)
		} else {
			const errors = message.errors || ['Unknown error occurred']
			setErrors(errors)
			setRowResults(null)

			// If we have previewData from backend, use it to show what went wrong
			if (message.previewData) {
				setPreviewData(message.previewData)
			}
		}
	}

	const handlePreviewChangesMessage = (message: ApplyChangeResponse) => {
		// Validate this is the current request to prevent race conditions
		if (currentRequestRef.current.type !== 'preview') {
			console.debug('[ApplyTab] Ignoring stale preview response')
			operationLockRef.current = false // Release mutex even for stale requests
			return
		}

		currentRequestRef.current = { type: null, timestamp: 0 }
		operationLockRef.current = false // Release mutex
		setIsPreviewing(false)

		if (message.success) {
			setPreviewData(message.previewData || null)
			setErrors(null)
		} else {
			setErrors(message.errors || ['Unknown error occurred'])
			// Set previewData if it exists (for error display), otherwise null
			setPreviewData(message.previewData || null)
		}
	}

	const handleApplyRowChangeMessage = (message: ApplyChangeResponse) => {
		// Handle individual row apply result - errors are shown in PreviewTable
		if (!message.success) {
			setErrors(message.errors || ['Unknown error occurred'])
		}
	}

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data as ApplyChangeResponse

			if (message.command === 'applyChangesResult') {
				handleApplyChangesMessage(message)
			} else if (message.command === 'previewChangesResult') {
				handlePreviewChangesMessage(message)
			} else if (message.command === 'applyRowChangeResult') {
				handleApplyRowChangeMessage(message)
			}
		}

		window.addEventListener('message', handleMessage)
		return () => window.removeEventListener('message', handleMessage)
	}, [previewData])

	const handleTextChange = useCallback((event: React.SyntheticEvent) => {
		const target = event.target as HTMLTextAreaElement
		const value = target.value
		setResponseText(value)
		// Live lint as user pastes/edits
		try {
			const liveIssues = lintXmlText(value)
			setLints(liveIssues)
		} catch {
			// be forgiving in live lint
		}
	}, [])

	const handleButtonKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLElement>, action: () => void) => {
			if (event.key === 'Enter' || event.key === ' ') {
				action()
			}
		},
		[],
	)

	// Helper to detect if a failure might be caused by previous row changes
	const detectCascadeFailure = (
		result: ApplyResult | undefined,
		allResults: ApplyResult[],
		currentIndex: number,
	): boolean => {
		if (!result || result.success) return false

		// Check if error mentions "not found" or "search text"
		const isFindError =
			result.message.includes('not found') ||
			result.message.includes('Search text')

		if (!isFindError) return false

		// Check if any previous row for the same file succeeded
		const currentPath = result.path
		for (let i = 0; i < currentIndex; i++) {
			const prevResult = allResults[i]
			if (prevResult && prevResult.path === currentPath && prevResult.success) {
				return true // Previous change to same file likely caused this failure
			}
		}

		return false
	}

	return (
		<div className="flex flex-col h-full overflow-hidden gap-y-2 py-2 pb-20">
			{/* Fixed header area */}
			<div className="bg-bg z-10">
				<ResponseTextarea
					responseText={responseText}
					onTextChange={handleTextChange}
				/>
				{/* Lint / normalization notes */}
				{lints && lints.length > 0 && (
					<div className="mt-2 p-2 rounded border border-warn-border bg-warn-bg">
						<div className="text-xs font-medium text-muted mb-1">Lint</div>
						<ul className="text-xs list-disc ml-5">
							{lints.map((m) => (
								<li key={m} className="text-muted">
									{m}
								</li>
							))}
						</ul>
					</div>
				)}
				<ApplyActions
					isApplying={isApplying}
					isPreviewing={isPreviewing}
					onPreview={handlePreview}
					onApply={handleApply}
					handleButtonKeyDown={handleButtonKeyDown}
				/>
			</div>

			{/* Scrollable content area */}
			<div className="flex-1 min-h-0 overflow-auto pb-12">
				{/* Show standalone errors if no preview data */}
				{errors && !previewData && (
					<div className="p-3 bg-warn-bg border border-warn-border rounded">
						<h4 className="text-error font-medium mb-2">Errors:</h4>
						<ul className="text-error">
							{errors.map((error) => (
								<li key={error} className="mb-1">
									{error}
								</li>
							))}
						</ul>
					</div>
				)}

				{/* Show preview table if available - it handles its own error display */}
				{previewData && (
					<PreviewTable
						previewData={previewData}
						onApplyRow={handleApplyRow}
						onPreviewRow={handlePreviewRow}
						isApplying={isApplying}
						rowResults={rowResults}
						responseText={responseText}
					/>
				)}
			</div>
		</div>
	)
}

export default ApplyTab

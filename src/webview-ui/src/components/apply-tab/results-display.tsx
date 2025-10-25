import { useCallback, useEffect, useMemo, useState } from 'react'
import { getVsCodeApi } from '../../utils/vscode'
import type { ApplyResult } from './types'

interface ResultsDisplayProps {
	results: ApplyResult[] | null
	errors: string[] | null
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ results, errors }) => {
	const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>(
		'idle',
	)

	const aggregatedErrors = useMemo(() => {
		const messages: string[] = []
		if (errors?.length) {
			messages.push(...errors)
		}
		if (results?.length) {
			for (const result of results) {
				if (!result.success) {
					const line = `${result.path} (${result.action}): ${result.message}`
					messages.push(line)
				}
			}
		}
		return messages
	}, [errors, results])

	const handleCopyErrors = useCallback(() => {
		if (!aggregatedErrors.length) return
		try {
			const vscode = getVsCodeApi()
			vscode.postMessage({
				command: 'copyApplyErrors',
				payload: { text: aggregatedErrors.join('\n') },
			})
			setCopyState('copied')
		} catch (error) {
			console.error('Failed to copy errors', error)
			setCopyState('error')
		}
	}, [aggregatedErrors])

	useEffect(() => {
		if (copyState === 'idle') return
		const handle = window.setTimeout(() => setCopyState('idle'), 1500)
		return () => window.clearTimeout(handle)
	}, [copyState])

	if (!results && !errors) {
		return null
	}

	return (
		<div style={{ marginTop: '20px' }}>
			<vscode-divider style={{ margin: '10px 0' }}></vscode-divider>
			<div className="flex items-center gap-3">
				<h3>Results:</h3>
				{aggregatedErrors.length > 0 && (
					<div className="flex items-center gap-2">
						<vscode-button onClick={handleCopyErrors}>
							Copy Errors
						</vscode-button>
						{copyState === 'copied' && (
							<span className="text-xs text-muted">Copied</span>
						)}
						{copyState === 'error' && (
							<span className="text-xs text-error">Copy failed</span>
						)}
					</div>
				)}
			</div>

			{errors && errors.length > 0 && (
				<div style={{ marginBottom: '10px' }}>
					<h4 style={{ color: 'var(--vscode-errorForeground)' }}>Errors:</h4>
					<ul style={{ color: 'var(--vscode-errorForeground)' }}>
						{errors.map((error, index) => (
							<li key={index}>{error}</li>
						))}
					</ul>
				</div>
			)}

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
	)
}

export default ResultsDisplay

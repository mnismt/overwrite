import type React from 'react'
import { useCallback, useState } from 'react'
import { getVsCodeApi } from '../../utils/vscode'
import ChangeBar from './change-bar'
import type { PreviewData, RowApplyResult } from './types'

interface PreviewTableProps {
	previewData: PreviewData | null
	onApplyRow: (rowIndex: number) => void
	onPreviewRow?: (rowIndex: number) => void
	isApplying?: boolean
	rowResults?: RowApplyResult[] | null
}

const PreviewTable: React.FC<PreviewTableProps> = ({
	previewData,
	onApplyRow,
	onPreviewRow,
	isApplying = false,
	rowResults = null,
}) => {
	const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')

	const handleCopyErrors = useCallback(() => {
		if (!rowResults) return

		const failedRows = rowResults.filter((r) => !r.success)
		if (failedRows.length === 0) return

		const errorText = failedRows
			.map((r) => {
				const cascadeNote = r.isCascadeFailure
					? ' [CASCADE: Previous row changed this file]'
					: ''
				return `Row ${r.rowIndex + 1} - ${r.action} ${r.path}${cascadeNote}\nError: ${r.message}\n`
			})
			.join('\n')

		try {
			const vscode = getVsCodeApi()
			vscode.postMessage({
				command: 'copyApplyErrors',
				payload: { text: errorText },
			})
			setCopyState('copied')
			setTimeout(() => setCopyState('idle'), 1500)
		} catch (error) {
			console.error('Failed to copy errors', error)
		}
	}, [rowResults])

	if (!previewData) {
		return null
	}

	const { rows, errors } = previewData
	const hasFailures = rowResults?.some((r) => !r.success) || false

	return (
		<div className="mt-4">
			<vscode-divider className="my-4"></vscode-divider>

			{/* Row-level results summary */}
			{rowResults && rowResults.length > 0 && (
				<div className="mb-4">
					<div className="flex items-center justify-between mb-2">
						<h4 className="font-medium">
							Apply Results: {rowResults.filter((r) => r.success).length}/
							{rowResults.length} successful
						</h4>
						{hasFailures && (
							<div className="flex items-center gap-2">
								<vscode-button onClick={handleCopyErrors}>
									Copy All Errors
								</vscode-button>
								{copyState === 'copied' && (
									<span className="text-xs text-muted">Copied!</span>
								)}
							</div>
						)}
					</div>

					{hasFailures && (
						<div className="p-3 bg-warn-bg border border-warn-border rounded text-sm">
							<p className="font-medium text-error mb-2">Failed operations:</p>
							{rowResults
								.filter((r) => !r.success)
								.map((r) => (
									<div key={`${r.rowIndex}-${r.path}`} className="mb-2 pl-2 border-l-2 border-error">
										<div className="flex items-start gap-2">
											<span className="font-mono text-xs">
												Row {r.rowIndex + 1}:
											</span>
											<div className="flex-1">
												<div className="font-medium">
													{r.action} {r.path}
												</div>
												<div className="text-xs text-muted mt-1">
													{r.message}
												</div>
												{r.isCascadeFailure && (
													<div className="text-xs text-warning mt-1 italic">
														⚠️ Cascade failure: Previous row(s) changed this
														file's content
													</div>
												)}
											</div>
										</div>
									</div>
								))}
						</div>
					)}
				</div>
			)}

			{/* Fixed errors section */}
			{errors && errors.length > 0 && (
				<div className="mb-4 p-3 bg-warn-bg border border-warn-border rounded">
					<h4 className="text-error font-medium mb-2">Preview Errors:</h4>
					<ul className="text-error">
						{errors.map((error) => (
							<li key={error} className="mb-1">
								{error}
							</li>
						))}
					</ul>
				</div>
			)}

			{/* Table area */}
			{rows && rows.length > 0 && (
				<div>
					<vscode-table columns={['5%', '28%', '37%', '20%', '10%']}>
						<vscode-table-header>
							<vscode-table-row>
								<vscode-table-header-cell className="px-1 text-center">
									Status
								</vscode-table-header-cell>
								<vscode-table-header-cell className="px-1">
									Path
								</vscode-table-header-cell>
								<vscode-table-header-cell className="px-1">
									Description
								</vscode-table-header-cell>
								<vscode-table-header-cell className="px-1">
									Changes
								</vscode-table-header-cell>
								<vscode-table-header-cell className="text-center">
									Actions
								</vscode-table-header-cell>
							</vscode-table-row>
						</vscode-table-header>
						<vscode-table-body>
							{rows.map((row, index) => {
								const rowResult = rowResults?.find((r) => r.rowIndex === index)
								const hasResult = rowResult !== undefined
								const isSuccess = rowResult?.success ?? false
								const isFailed = hasResult && !isSuccess
								const isCascade = rowResult?.isCascadeFailure ?? false
								let backgroundColor: string | undefined
								if (isFailed) {
									backgroundColor = 'var(--vscode-inputValidation-errorBackground)'
								} else if (isSuccess) {
									backgroundColor = 'var(--vscode-inputValidation-infoBackground)'
								}

								return (
									<vscode-table-row
										key={`${row.path}-${row.action}-${index}`}
										style={{ backgroundColor }}
									>
										<vscode-table-cell
											className="align-top py-2 px-1 text-center"
											style={{}}
										>
											{hasResult ? (
												<div className="flex flex-col items-center gap-1">
													<vscode-icon
														name={isSuccess ? 'pass-filled' : 'error'}
														style={{
															color: isSuccess
																? 'var(--vscode-testing-iconPassed)'
																: 'var(--vscode-testing-iconFailed)',
														}}
													/>
													{isCascade && (
														<vscode-icon
															name="warning"
															title="Cascade failure"
															style={{
																color: 'var(--vscode-testing-iconQueued)',
																fontSize: '10px',
															}}
														/>
													)}
												</div>
											) : (
												<span className="text-muted text-xs">—</span>
											)}
										</vscode-table-cell>
										<vscode-table-cell
											className="align-top py-2 px-1"
											style={{
												wordBreak: 'break-word',
												whiteSpace: 'normal',
											}}
										>
											<div className="font-mono text-sm break-words">
												{row.path}
												{row.action === 'rename' && row.newPath && (
													<div className="text-muted text-xs mt-1 break-words">
														→ {row.newPath}
													</div>
												)}
											</div>
										</vscode-table-cell>
										<vscode-table-cell
											className="align-top py-2 px-1"
											style={{
												wordBreak: 'break-word',
												whiteSpace: 'normal',
											}}
										>
											<div className="text-sm break-words">
												{row.description}
												{row.hasError && (
													<div className="text-error text-xs mt-1 break-words">
														{row.errorMessage}
													</div>
												)}
											</div>
										</vscode-table-cell>
										<vscode-table-cell className="align-top py-2 px-1" style={{}}>
											<div className="flex flex-col gap-1">
												<div className="text-xs font-mono">
													{row.changes.added > 0 && (
														<span className="text-green-600">
															+{row.changes.added}
														</span>
													)}
													{row.changes.added > 0 &&
														row.changes.removed > 0 &&
														' '}
													{row.changes.removed > 0 && (
														<span className="text-red-600">
															−{row.changes.removed}
														</span>
													)}
													{row.changes.added === 0 &&
														row.changes.removed === 0 && (
															<span className="text-muted">—</span>
														)}
												</div>
												<ChangeBar changes={row.changes} />
											</div>
										</vscode-table-cell>
										<vscode-table-cell
											className="align-top py-2 px-1 text-center"
											style={{}}
										>
											<div className="flex flex-col items-center justify-center gap-2">
												<vscode-button
													onClick={() => onPreviewRow?.(index)}
													disabled={row.hasError || row.action === 'rename'}
													aria-label={`Preview ${row.action} for ${row.path}`}
													title={`Preview ${row.action} for ${row.path}`}
													className="h-6"
												>
													<span className="codicon codicon-play"></span>
												</vscode-button>
												<vscode-button
													onClick={() => onApplyRow(index)}
													disabled={row.hasError || isApplying}
													aria-label={`Apply ${row.action} to ${row.path}`}
													title={`Apply ${row.action} to ${row.path}`}
													className="h-6"
												>
													<span className="codicon codicon-edit"></span>
												</vscode-button>
											</div>
										</vscode-table-cell>
									</vscode-table-row>
								)
							})}
						</vscode-table-body>
					</vscode-table>
				</div>
			)}

			{rows && rows.length === 0 && !errors?.length && (
				<div className="text-center text-muted py-8">
					No changes detected in the XML response.
				</div>
			)}
		</div>
	)
}

export default PreviewTable

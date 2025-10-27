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
	responseText?: string
}

const PreviewTable: React.FC<PreviewTableProps> = ({
	previewData,
	onApplyRow,
	onPreviewRow,
	isApplying = false,
	rowResults = null,
	responseText = '',
}) => {
	const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
	const [aiCopyState, setAiCopyState] = useState<'idle' | 'copied'>('idle')

	const buildFixInstructions = (includeOPX: boolean): string[] => {
		const base = [
			'# AI Fix Instructions',
			'',
			'Please analyze the errors above and understand the current state of each file.',
			'',
			'Key points to fix:',
			'1. Search patterns that failed to match - they need to match the CURRENT file content',
			'2. Cascade failures - previous operations changed the file, update your patterns accordingly',
			'3. File structure - ensure you understand the full context of each file',
			'',
			'For cascade failures:',
			'- Update search patterns to match the file state AFTER previous operations',
			'- Consider using occurrence="last" if multiple matches exist',
			'- Make search patterns more specific by including more surrounding context',
			'',
		]

		if (includeOPX) {
			base.push(
				'Generate new OPX with corrected operations based on the current file states.',
			)
		} else {
			base.push(
				'Provide the corrected code changes that should be applied to fix these issues.',
			)
		}

		return base
	}

	const buildChangeBlockDetails = (block: {
		search?: string
		content: string
		description: string
	}): string[] => {
		const details: string[] = [`Change block: ${block.description}`]

		if (block.search) {
			details.push(
				'Search pattern (NOT FOUND):',
				'```',
				block.search,
				'```',
				'Intended replacement:',
				'```',
				block.content,
				'```',
			)
		} else {
			details.push('Intended replacement:', '```', block.content, '```')
		}

		return details
	}

	const buildPreviousOperations = (previousOps: RowApplyResult[]): string[] => {
		if (previousOps.length === 0) return []

		return [
			'- Previous successful operations:',
			...previousOps.map((op) => `  - Row ${op.rowIndex + 1}: ${op.action}`),
		]
	}

	const getRowStatus = (
		result: RowApplyResult | undefined,
	): '✅' | '❌' | '⏸️' => {
		if (result?.success) return '✅'
		if (result) return '❌'
		return '⏸️'
	}

	const buildSuccessfulOperationsSection = (
		successRows: RowApplyResult[],
		data: PreviewData,
	): string[] => {
		if (successRows.length === 0) return []

		const section: string[] = [
			'## ✅ Successfully Applied Operations',
			'',
			'**These operations completed successfully. The files listed below have ALREADY been modified.**',
			'**When fixing failed operations, account for these changes that are now in the codebase.**',
			'',
		]

		for (const result of successRows) {
			const row = data.rows[result.rowIndex]
			if (!row) continue

			section.push(
				`### Row ${result.rowIndex + 1}: ${result.action} \`${result.path}\``,
				'- Status: ✅ SUCCESS',
				`- Operation: ${result.action}`,
				`- Description: ${row.description}`,
			)

			if (row.changeBlocks?.length) {
				section.push('- Applied changes:')
				for (const [idx, block] of row.changeBlocks.entries()) {
					section.push(`  ${idx + 1}. ${block.description}`)
				}
			}

			section.push('')
		}

		section.push('---', '', '')
		return section
	}

	const buildXmlReferenceSection = (
		rowResults: RowApplyResult[],
		data: PreviewData,
	): string[] => {
		const section: string[] = [
			'',
			'---',
			'',
			'## 📋 Original XML (For Reference)',
			'',
			'Below is the complete original OPX that was attempted:',
			'',
			'```xml',
		]

		for (let idx = 0; idx < data.rows.length; idx++) {
			const row = data.rows[idx]
			const result = rowResults.find((r) => r.rowIndex === idx)
			const status = getRowStatus(result)

			section.push(
				`<!-- ${status} Row ${idx + 1}: ${row.action} ${row.path} -->`,
			)

			if (row.changeBlocks?.length) {
				for (const block of row.changeBlocks) {
					if (block.search) {
						section.push('<find>', '<<<', block.search, '>>>', '</find>')
					}
					section.push('<put>', '<<<', block.content, '>>>', '</put>')
				}
			}
			section.push(`<!-- End of Row ${idx + 1} -->`, '')
		}

		section.push('```', '')
		return section
	}

	const buildErrorDetails = (
		rowIndex: number,
		result: RowApplyResult,
		row: PreviewData['rows'][0] | undefined,
		filePath: string,
		allResults: RowApplyResult[],
	): string[] => {
		const details: string[] = [
			`#### Row ${rowIndex + 1}: ${result.action}`,
			`- Error: ${result.message}`,
		]

		if (result.isCascadeFailure) {
			const previousOps = allResults
				.slice(0, rowIndex)
				.filter((r) => r.path === filePath && r.success)

			details.push(
				'- **CASCADE FAILURE**: Previous row(s) modified this file',
				...buildPreviousOperations(previousOps),
			)
		}

		if (row?.changeBlocks) {
			details.push(
				'',
				'**Attempted changes:**',
				...row.changeBlocks.flatMap((block, i) =>
					buildChangeBlockDetails({
						...block,
						description: `${i + 1}: ${block.description}`,
					}).map((line, idx) => (idx === 0 ? `\n${line}` : line)),
				),
			)
		}

		details.push('', '---', '')
		return details
	}

	const buildFileSection = (
		filePath: string,
		errors: Array<{ rowIndex: number; result: RowApplyResult }>,
		allResults: RowApplyResult[],
	): string[] => {
		return [
			`### File: ${filePath}`,
			'',
			'**Current file content:** (Request this from your IDE/filesystem)',
			`\`\`\`typescript\n// Full content of ${filePath} needed here\n\`\`\``,
			'',
			'**Failed operations on this file:**',
			'',
			...errors.flatMap(({ rowIndex, result }) => {
				const row = previewData?.rows[rowIndex]
				return buildErrorDetails(rowIndex, result, row, filePath, allResults)
			}),
		]
	}

	const buildHeaderSummary = (
		successRows: RowApplyResult[],
		failedRows: RowApplyResult[],
		allRows: RowApplyResult[],
	): string[] => [
		'# Complete Apply Context for AI',
		'',
		'## Apply Results Summary',
		`- ✅ Successful operations: ${successRows.length}`,
		`- ❌ Failed operations: ${failedRows.length}`,
		`- 📊 Total operations: ${allRows.length}`,
		'',
		'---',
		'',
	]

	const buildFailedOperationsSection = (
		fileErrors: Map<
			string,
			Array<{ rowIndex: number; result: RowApplyResult }>
		>,
		rowResults: RowApplyResult[],
	): string[] => {
		const section: string[] = [
			'## ❌ Failed Operations (NEEDS FIXING)',
			'',
			'**The following operations failed and need to be corrected:**',
			'',
		]

		section.push(
			...Array.from(fileErrors.entries()).flatMap(([filePath, errors]) =>
				buildFileSection(filePath, errors, rowResults),
			),
		)

		return section
	}

	const buildFullContext = useCallback(
		(includeOPX: boolean): string => {
			if (!rowResults || !previewData) return ''

			const failedRows = rowResults.filter((r) => !r.success)
			const successRows = rowResults.filter((r) => r.success)

			const fileErrors = new Map<
				string,
				Array<{ rowIndex: number; result: RowApplyResult }>
			>()

			for (const result of failedRows) {
				if (!fileErrors.has(result.path)) {
					fileErrors.set(result.path, [])
				}
				fileErrors.get(result.path)!.push({ rowIndex: result.rowIndex, result })
			}

			const sections: string[] = [
				...buildHeaderSummary(successRows, failedRows, rowResults),
				...buildSuccessfulOperationsSection(successRows, previewData),
				...buildFailedOperationsSection(fileErrors, rowResults),
			]

			if (includeOPX) {
				sections.push(...buildXmlReferenceSection(rowResults, previewData))

				if (responseText) {
					sections.push(
						'',
						'---',
						'',
						'## 📄 Complete Original XML Input (For Chat AI Context)',
						'',
						'Here is the complete OPX/XML that was submitted:',
						'',
						'```xml',
						responseText,
						'```',
						'',
					)
				}
			}

			sections.push(...buildFixInstructions(includeOPX))

			return sections.join('\n')
		},
		[previewData, rowResults, responseText],
	)

	// Copy for Chat AI - includes full context + OPX
	const handleCopyAiContext = useCallback(() => {
		const context = buildFullContext(true)
		if (!context) return

		try {
			const vscode = getVsCodeApi()
			vscode.postMessage({
				command: 'copyApplyErrors',
				payload: { text: context },
			})
			setAiCopyState('copied')
			setTimeout(() => setAiCopyState('idle'), 1500)
		} catch (error) {
			console.error('Failed to copy AI context', error)
		}
	}, [buildFullContext])

	// Copy for IDE AI - includes full context WITHOUT OPX
	const handleCopyErrors = useCallback(() => {
		if (!rowResults || !previewData) return

		const failedRows = rowResults.filter((r) => !r.success)
		if (failedRows.length === 0) return

		const context = buildFullContext(false)

		try {
			const vscode = getVsCodeApi()
			vscode.postMessage({
				command: 'copyApplyErrors',
				payload: { text: context },
			})
			setCopyState('copied')
			setTimeout(() => setCopyState('idle'), 1500)
		} catch (error) {
			console.error('Failed to copy errors', error)
		}
	}, [rowResults, previewData, buildFullContext])

	if (!previewData) {
		return null
	}

	const { rows, errors } = previewData
	const hasFailures = rowResults?.some((r) => !r.success) || false

	return (
		<div className="mt-4">
			{/* Row-level results summary - only show when there are actual results */}
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
									Copy Errors (IDE AI)
								</vscode-button>
								<vscode-button onClick={handleCopyAiContext}>
									Copy Errors (Chat AI)
								</vscode-button>
								{copyState === 'copied' && (
									<span className="text-xs text-muted">Copied!</span>
								)}
								{aiCopyState === 'copied' && (
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
									<div
										key={`${r.rowIndex}-${r.path}`}
										className="mb-2 pl-2 border-l-2 border-error"
									>
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

			{/* Preview/parsing errors section */}
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

			{/* Preview table with status for each operation */}
			{rows && rows.length > 0 && (
				<div>
					<vscode-table columns={['10%', '28%', '32%', '20%', '10%']}>
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
									backgroundColor =
										'var(--vscode-inputValidation-errorBackground)'
								} else if (isSuccess) {
									backgroundColor =
										'var(--vscode-inputValidation-infoBackground)'
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
										<vscode-table-cell
											className="align-top py-2 px-1"
											style={{}}
										>
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

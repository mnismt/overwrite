import type React from 'react'
import ChangeBar from './change-bar'
import type { PreviewData } from './types'

interface PreviewTableProps {
	previewData: PreviewData | null
	onApplyRow: (rowIndex: number) => void
	isApplying?: boolean
}

const PreviewTable: React.FC<PreviewTableProps> = ({
	previewData,
	onApplyRow,
	isApplying = false,
}) => {
	if (!previewData) {
		return null
	}

	const { rows, errors } = previewData

	return (
		<div className="mt-4">
			<vscode-divider className="my-4"></vscode-divider>

			{errors && errors.length > 0 && (
				<div className="mb-4 p-3 bg-warn-bg border border-warn-border rounded">
					<h4 className="text-error font-medium mb-2">Preview Errors:</h4>
					<ul className="text-error">
						{errors.map((error, index) => (
							<li key={index} className="mb-1">
								{error}
							</li>
						))}
					</ul>
				</div>
			)}

			{rows && rows.length > 0 && (
				<div>
					<h4 className="mb-3 font-medium">Proposed Changes:</h4>
					<vscode-table columns={['50%', '35%', '10%', '5%']}>
						<vscode-table-header>
							<vscode-table-row>
								<vscode-table-header-cell>Path</vscode-table-header-cell>
								<vscode-table-header-cell>Description</vscode-table-header-cell>
								<vscode-table-header-cell>Changes</vscode-table-header-cell>
								<vscode-table-header-cell className="text-center">
									Actions
								</vscode-table-header-cell>
							</vscode-table-row>
						</vscode-table-header>
						<vscode-table-body>
							{rows.map((row, index) => (
								<vscode-table-row key={index}>
									<vscode-table-cell
										className="align-top py-2"
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
										className="align-top py-2"
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
									<vscode-table-cell className="align-top py-2" style={{}}>
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
										className="align-top py-2 text-center"
										style={{}}
									>
										<vscode-button
											onClick={() => onApplyRow(index)}
											disabled={row.hasError || isApplying}
											aria-label={`Apply ${row.action} to ${row.path}`}
											title={`Apply ${row.action} to ${row.path}`}
										>
											<span className="codicon codicon-play"></span>
										</vscode-button>
									</vscode-table-cell>
								</vscode-table-row>
							))}
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

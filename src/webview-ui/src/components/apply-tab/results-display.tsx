import type { ApplyResult } from './types'

interface ResultsDisplayProps {
	results: ApplyResult[] | null
	errors: string[] | null
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ results, errors }) => {
	if (!results && !errors) {
		return null
	}

	return (
		<div style={{ marginTop: '20px' }}>
			<vscode-divider style={{ margin: '10px 0' }}></vscode-divider>
			<h3>Results:</h3>

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

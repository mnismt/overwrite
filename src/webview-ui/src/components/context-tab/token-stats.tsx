interface TokenStatsProps {
	tokenStats: {
		fileTokensEstimate: number
		userInstructionsTokens: number
		totalTokens: number
		totalWithXmlTokens: number
	}
	skippedFiles: Array<{ uri: string; reason: string; message?: string }>
}

const TokenStats: React.FC<TokenStatsProps> = ({
	tokenStats,
	skippedFiles,
}) => {
	return (
		<>
			{/* Token Count Information */}
			<div
				style={{
					marginTop: '10px',
					fontSize: '0.9em',
					color: 'var(--vscode-descriptionForeground)',
				}}
			>
				<div>File tokens (actual): {tokenStats.fileTokensEstimate}</div>
				<div>User instruction tokens: {tokenStats.userInstructionsTokens}</div>
				<div>Total tokens (Copy Context): {tokenStats.totalTokens}</div>
				<div>
					Total tokens (Copy Context + XML): {tokenStats.totalWithXmlTokens}
				</div>
			</div>

			{/* Skipped Files Information */}
			{skippedFiles.length > 0 && (
				<div
					style={{
						marginTop: '10px',
						fontSize: '0.8em',
						color: 'var(--vscode-errorForeground)',
						backgroundColor: 'var(--vscode-inputValidation-warningBackground)',
						border: '1px solid var(--vscode-inputValidation-warningBorder)',
						borderRadius: '3px',
						padding: '8px',
					}}
				>
					<div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
						⚠️ Skipped Files ({skippedFiles.length}):
					</div>
					{skippedFiles.map((file, index) => (
						<div key={index} style={{ marginBottom: '2px' }}>
							<span style={{ fontFamily: 'monospace' }}>
								{file.uri.split('/').pop()}
							</span>
							{' - '}
							<span style={{ fontStyle: 'italic' }}>
								{file.reason === 'binary'
									? 'Binary file'
									: file.reason === 'too-large'
										? 'Too large'
										: 'Error'}
							</span>
							{file.message && (
								<span style={{ color: 'var(--vscode-descriptionForeground)' }}>
									{' '}
									({file.message})
								</span>
							)}
						</div>
					))}
				</div>
			)}
		</>
	)
}

export default TokenStats

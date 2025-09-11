import { cn } from '../../lib/utils'

interface TokenStatsProps {
	className?: string
	tokenStats: {
		fileTokensEstimate: number
		userInstructionsTokens: number
		totalTokens: number
		totalWithXmlTokens: number
	}
	skippedFiles: Array<{ uri: string; reason: string; message?: string }>
	compact?: boolean
}

const TokenStats: React.FC<TokenStatsProps> = ({
	className,
	tokenStats,
	skippedFiles,
	compact,
}) => {
	if (compact) {
		return (
			<div
				className={cn(
					'flex flex-col text-xs text-muted leading-tight',
					className,
				)}
			>
				<div>Files: {tokenStats.fileTokensEstimate}</div>
				<div>Instructions: {tokenStats.userInstructionsTokens}</div>
				<div>Total: {tokenStats.totalTokens}</div>
				<div>With XML: {tokenStats.totalWithXmlTokens}</div>
			</div>
		)
	}

	return (
		<>
			{/* Token Count Information */}
			<div className={cn('mt-2 text-xs text-muted', className)}>
				<p>File tokens (actual): {tokenStats.fileTokensEstimate}</p>
				<p>User instruction tokens: {tokenStats.userInstructionsTokens}</p>
				<p>Total tokens (Copy Context): {tokenStats.totalTokens}</p>
				<p>
					Total tokens (Copy Context + XML): {tokenStats.totalWithXmlTokens}
				</p>
			</div>

			{/* Skipped Files Information */}
			{skippedFiles.length > 0 && (
				<div className="mt-2 text-xs text-error bg-warn-bg border border-warn-border rounded px-2 py-2">
					<p className="font-semibold mb-1">
						⚠️ Skipped Files ({skippedFiles.length}):
					</p>
					{skippedFiles.map((file, index) => (
						<div key={index} className="mb-0.5">
							<span className="font-mono">{file.uri.split('/').pop()}</span>
							{' - '}
							<span className="italic">
								{file.reason === 'binary'
									? 'Binary file'
									: file.reason === 'too-large'
										? 'Too large'
										: 'Error'}
							</span>
							{file.message && (
								<span className="text-muted"> ({file.message})</span>
							)}
						</div>
					))}
				</div>
			)}
		</>
	)
}

export default TokenStats

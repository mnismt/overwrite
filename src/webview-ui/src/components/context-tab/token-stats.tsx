import { cn } from '../../lib/utils'

interface TokenStatsProps {
	className?: string
	selectedCount?: number
	tokenStats: {
		fileTokensEstimate: number
		userInstructionsTokens: number
		totalTokens: number
		totalWithXmlTokens: number
	}
	skippedFiles: Array<{ uri: string; reason: string; message?: string }>
}

const TokenStats: React.FC<TokenStatsProps> = ({
	className,
	selectedCount,
	tokenStats,
	skippedFiles,
}) => {
	return (
		<>
			{/* Token Count Information */}
			<div className={cn('mt-2 text-xs text-muted', className)}>
				<p>Selected files: {selectedCount}</p>
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

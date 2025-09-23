import type React from 'react'

interface LoadingOverlayProps {
	isVisible: boolean
	message?: string
	className?: string
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
	isVisible,
	message = 'Loading...',
	className = '',
}) => {
	if (!isVisible) return null

	return (
		<div className={`loading-overlay ${className}`}>
			<div className="loading-content">
				<vscode-progress-ring />
				{message && (
					<div className="loading-message text-muted text-sm mt-2">
						{message}
					</div>
				)}
			</div>
		</div>
	)
}

export default LoadingOverlay

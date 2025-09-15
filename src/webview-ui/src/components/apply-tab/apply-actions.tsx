import type React from 'react'

interface ApplyActionsProps {
	isApplying: boolean
	isPreviewing: boolean
	onPreview: () => void
	onApply: () => void
	handleButtonKeyDown: (
		event: React.KeyboardEvent<HTMLElement>,
		action: () => void,
	) => void
}

const ApplyActions: React.FC<ApplyActionsProps> = ({
	isApplying,
	isPreviewing,
	onPreview,
	onApply,
	handleButtonKeyDown,
}) => {
	return (
		<div className="flex gap-2 mt-2">
			<vscode-button
				onClick={onPreview}
				onKeyDown={(e) => handleButtonKeyDown(e, onPreview)}
				disabled={isPreviewing || isApplying}
			>
				{isPreviewing ? 'Previewing…' : 'Preview Changes'}
			</vscode-button>
			<vscode-button
				onClick={onApply}
				onKeyDown={(e) => handleButtonKeyDown(e, onApply)}
				disabled={isApplying || isPreviewing}
			>
				{isApplying ? 'Applying Changes…' : 'Apply Changes'}
			</vscode-button>
		</div>
	)
}

export default ApplyActions

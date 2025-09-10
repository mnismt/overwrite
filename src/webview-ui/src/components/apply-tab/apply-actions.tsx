import type React from 'react'

interface ApplyActionsProps {
	isApplying: boolean
	onApply: () => void
	handleButtonKeyDown: (
		event: React.KeyboardEvent<HTMLElement>,
		action: () => void,
	) => void
}

const ApplyActions: React.FC<ApplyActionsProps> = ({
	isApplying,
	onApply,
	handleButtonKeyDown,
}) => {
	return (
		<vscode-button
			onClick={onApply}
			onKeyDown={(e) => handleButtonKeyDown(e, onApply)}
			disabled={isApplying}
		>
			{isApplying ? 'Applying Changes...' : 'Preview & Apply Changes'}
		</vscode-button>
	)
}

export default ApplyActions

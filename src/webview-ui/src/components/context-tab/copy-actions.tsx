interface CopyActionsProps {
	selectedCount: number
	onCopy: ({
		includeXml,
		userInstructions,
	}: {
		includeXml: boolean
		userInstructions: string
	}) => void
	userInstructions: string
}

const CopyActions: React.FC<CopyActionsProps> = ({
	selectedCount,
	onCopy,
	userInstructions,
}) => {
	const handleCopyContextClick = () =>
		onCopy({ includeXml: false, userInstructions })
	const handleCopyContextXmlClick = () =>
		onCopy({ includeXml: true, userInstructions })

	return (
		<>
			<p>Selected files: {selectedCount}</p>

			<div className="flex gap-2">
				<vscode-button onClick={handleCopyContextClick}>
					Copy Context
				</vscode-button>
				<vscode-button onClick={handleCopyContextXmlClick}>
					Copy Context + XML Instructions
				</vscode-button>
			</div>
		</>
	)
}

export default CopyActions

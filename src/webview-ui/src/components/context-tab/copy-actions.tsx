interface CopyActionsProps {
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
	onCopy,
	userInstructions,
}) => {
	const handleCopy = (xml: boolean) =>
		onCopy({ includeXml: xml, userInstructions })

	const handleCopyContextClick = () => handleCopy(false)
	const handleCopyContextXmlClick = () => handleCopy(true)

	return (
		<>
			<div className="flex flex-col gap-2">
				<vscode-button onClick={handleCopyContextClick}>
					Copy Context
				</vscode-button>
				<vscode-button onClick={handleCopyContextXmlClick}>
					Copy Context + XML
				</vscode-button>
			</div>
		</>
	)
}

export default CopyActions

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

const CopyActions: React.FC<CopyActionsProps> = ({ selectedCount, onCopy, userInstructions }) => {
  const handleCopy = (xml: boolean) => onCopy({ includeXml: xml, userInstructions })

  const handleCopyContextClick = () => handleCopy(false)
  const handleCopyContextXmlClick = () => handleCopy(true)

  return (
    <>
      <p>Selected files: {selectedCount}</p>

      <div className="grid grid-cols-2 gap-2">
        <vscode-button onClick={handleCopyContextClick}>Copy Context</vscode-button>
        <vscode-button onClick={handleCopyContextXmlClick}>Copy Context + XML</vscode-button>
      </div>
    </>
  )
}

export default CopyActions

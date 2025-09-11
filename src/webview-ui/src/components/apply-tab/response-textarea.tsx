import type React from 'react'

interface ResponseTextareaProps {
	responseText: string
	onTextChange: (event: React.SyntheticEvent) => void
}

const ResponseTextarea: React.FC<ResponseTextareaProps> = ({
	responseText,
	onTextChange,
}) => {
	return (
		<>
			<vscode-label htmlFor="llm-response-textarea" className="block mb-1">
				Paste LLM Response (XML Format)
			</vscode-label>
			<vscode-textarea
				id="llm-response-textarea"
				placeholder="Paste the full XML response from the AI here..."
				className="w-full"
				rows={15}
				value={responseText}
				onInput={onTextChange}
			/>
		</>
	)
}

export default ResponseTextarea

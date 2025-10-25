import type { VscodeTextarea } from '@vscode-elements/elements'
import React from 'react'

interface UserInstructionsProps {
	userInstructions: string
	onUserInstructionsChange: (instructions: string) => void
	onHeightChange?: (height: number) => void
}

const UserInstructions: React.FC<UserInstructionsProps> = ({
	userInstructions,
	onUserInstructionsChange,
	onHeightChange,
}) => {
	const textareaRef = React.useRef<VscodeTextarea | null>(null)
	const userResizedRef = React.useRef(false)
	const lastAutoHeightRef = React.useRef(0)

	// Auto-expand textarea based on content (only if user hasn't manually resized)
	const adjustHeight = React.useCallback(() => {
		const textarea = textareaRef.current
		if (!textarea || userResizedRef.current) return

		// Reset height to recalculate
		textarea.style.height = 'auto'

		// Set new height based on scrollHeight, with min and max constraints
		const newHeight = Math.min(Math.max(textarea.scrollHeight, 100), 400)
		textarea.style.height = `${newHeight}px`
		lastAutoHeightRef.current = newHeight

		// Notify parent about height change
		onHeightChange?.(newHeight)
	}, [onHeightChange])

	// Adjust height when content changes
	React.useEffect(() => {
		adjustHeight()
	}, [userInstructions, adjustHeight])

	// Adjust height on mount and detect manual resize
	React.useEffect(() => {
		const textarea = textareaRef.current
		if (!textarea) return

		adjustHeight()

		// Detect when user manually resizes
		const resizeObserver = new ResizeObserver(() => {
			if (!textarea) return
			const currentHeight = textarea.offsetHeight

			// Notify parent about height change (even for manual resize)
			onHeightChange?.(currentHeight)

			// If height differs significantly from auto-calculated, mark as user-resized
			if (Math.abs(currentHeight - lastAutoHeightRef.current) > 10) {
				userResizedRef.current = true
			}
		})

		resizeObserver.observe(textarea)

		return () => resizeObserver.disconnect()
	}, [adjustHeight, onHeightChange])

	// Reset user-resized flag when content is cleared
	React.useEffect(() => {
		if (!userInstructions || userInstructions.trim() === '') {
			userResizedRef.current = false
		}
	}, [userInstructions])

	return (
		<div className="flex flex-col">
			<div className="flex items-center justify-between mb-1">
				<vscode-label htmlFor="user-instructions">
					User Instruction
				</vscode-label>
				<a
					className="text-[8px] text-muted hover:underline hover:text-fg flex items-center gap-1"
					href="https://mnismt.com/overwrite"
					target="_blank"
					rel="noreferrer"
					aria-label="Open Overwrite docs and video demo in your browser"
				>
					<span>Docs</span>
				</a>
			</div>
			<vscode-textarea
				ref={textareaRef}
				id="user-instructions"
				resize="vertical"
				rows={8}
				placeholder="Enter instructions for the AI..."
				value={userInstructions}
				onInput={(e) => {
					const target = e.target as HTMLInputElement
					onUserInstructionsChange(target.value)
					adjustHeight()
				}}
				className="w-full min-h-[100px] max-h-[400px] transition-all duration-150"
			/>
		</div>
	)
}

export default UserInstructions

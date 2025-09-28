interface UserInstructionsProps {
	userInstructions: string
	onUserInstructionsChange: (instructions: string) => void
}

const UserInstructions: React.FC<UserInstructionsProps> = ({
	userInstructions,
	onUserInstructionsChange,
}) => {
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
				id="user-instructions"
				resize="vertical"
				rows={5}
				placeholder="Enter instructions for the AI..."
				value={userInstructions}
				onInput={(e) => {
					const target = e.target as HTMLInputElement
					onUserInstructionsChange(target.value)
				}}
				className="w-full min-h-[50px]"
			/>
		</div>
	)
}

export default UserInstructions

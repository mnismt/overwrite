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
			<vscode-label htmlFor="user-instructions" className="block mb-1">
				User Instruction
			</vscode-label>
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

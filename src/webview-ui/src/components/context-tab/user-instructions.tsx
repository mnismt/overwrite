interface UserInstructionsProps {
	userInstructions: string
	onUserInstructionsChange: (instructions: string) => void
}

const UserInstructions: React.FC<UserInstructionsProps> = ({
	userInstructions,
	onUserInstructionsChange,
}) => {
	return (
		<div className="mt-2 flex flex-col">
			<label htmlFor="user-instructions">User Instructions:</label>
			<vscode-textarea
				id="user-instructions"
				resize="vertical"
				rows={10}
				placeholder="Enter instructions for the AI..."
				value={userInstructions}
				onInput={(e) => {
					const target = e.target as HTMLInputElement
					onUserInstructionsChange(target.value)
				}}
				className="mt-1 w-full min-h-[100px]"
			/>
		</div>
	)
}

export default UserInstructions

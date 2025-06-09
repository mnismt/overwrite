interface UserInstructionsProps {
	userInstructions: string
	onUserInstructionsChange: (instructions: string) => void
}

const UserInstructions: React.FC<UserInstructionsProps> = ({
	userInstructions,
	onUserInstructionsChange,
}) => {
	return (
		<div
			style={{ marginTop: '10px', display: 'flex', flexDirection: 'column' }}
		>
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
				style={{ marginTop: '5px', width: '100%', minHeight: '100px' }}
			/>
		</div>
	)
}

export default UserInstructions

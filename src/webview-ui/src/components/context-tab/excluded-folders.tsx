interface ExcludedFoldersProps {
	excludedFolders: string
	onSaveExcludedFolders: (excludedFolders: string) => void
}

const ExcludedFolders: React.FC<ExcludedFoldersProps> = ({
	excludedFolders,
	onSaveExcludedFolders,
}) => {
	return (
		<div style={{ marginBottom: '10px', marginTop: '10px' }}>
			<label
				htmlFor="excluded-folders"
				style={{ fontSize: '0.9em', marginBottom: '5px', display: 'block' }}
			>
				Excluded Folders (one per line, similar to .gitignore):
			</label>
			<vscode-textarea
				id="excluded-folders"
				resize="vertical"
				rows={3}
				placeholder="Enter folder patterns to exclude (e.g., node_modules, .git, dist)..."
				value={excludedFolders}
				onInput={(e) => {
					const target = e.target as HTMLInputElement
					onSaveExcludedFolders(target.value)
				}}
				style={{ width: '100%', minHeight: '60px' }}
			/>
		</div>
	)
}

export default ExcludedFolders

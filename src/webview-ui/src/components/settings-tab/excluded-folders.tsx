import { useEffect, useState } from 'react'

interface ExcludedFoldersProps {
	excludedFolders: string
	onChangeExcludedFolders: (excludedFolders: string) => void
}

const ExcludedFolders: React.FC<ExcludedFoldersProps> = ({
	excludedFolders,
	onChangeExcludedFolders,
}) => {
	// Keep a responsive local state to avoid parent re-renders on every keystroke
	const [localValue, setLocalValue] = useState(excludedFolders)

	// Sync down when the prop changes externally
	useEffect(() => {
		if (excludedFolders !== localValue) setLocalValue(excludedFolders)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [excludedFolders])

	return (
		<div className="my-2">
			<label id="excluded-folders-label" htmlFor="excluded-folders" className="text-xs mb-1 block">
				Excluded Folders (one per line, similar to .gitignore):
			</label>
			<vscode-textarea
				id="excluded-folders"
				name="excludedFolders"
				aria-labelledby="excluded-folders-label"
				resize="vertical"
				rows={3}
				placeholder="Enter folder patterns to exclude (e.g., node_modules, .git, dist)..."
				value={localValue}
					onInput={(e) => {
					const target = e.target as unknown as { value?: string } & HTMLElement
					const next =
						(target as any)?.value ?? target.getAttribute('value') ?? ''
					setLocalValue(next)
					onChangeExcludedFolders(next)
				}}
				className="w-full min-h-[60px]"
			/>
		</div>
	)
}

export default ExcludedFolders

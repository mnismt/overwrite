import { useEffect, useRef, useState } from 'react'

interface ExcludedFoldersProps {
	excludedFolders: string
	onSaveExcludedFolders: (excludedFolders: string) => void
}

const ExcludedFolders: React.FC<ExcludedFoldersProps> = ({
	excludedFolders,
	onSaveExcludedFolders,
}) => {
	// Keep a responsive local state to avoid parent re-renders on every keystroke
	const [localValue, setLocalValue] = useState(excludedFolders)
	const timerRef = useRef<number | null>(null)

	// Sync down when the prop changes externally
	useEffect(() => {
		if (excludedFolders !== localValue) setLocalValue(excludedFolders)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [excludedFolders])

	const scheduleSave = (next: string) => {
		if (timerRef.current) window.clearTimeout(timerRef.current)
		timerRef.current = window.setTimeout(() => {
			onSaveExcludedFolders(next)
			timerRef.current = null
		}, 300)
	}

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
				value={localValue}
				onInput={(e) => {
					const target = e.target as HTMLInputElement
					const next = target.value
					setLocalValue(next)
					scheduleSave(next)
				}}
				style={{ width: '100%', minHeight: '60px' }}
			/>
		</div>
	)
}

export default ExcludedFolders

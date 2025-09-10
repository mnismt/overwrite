import { useEffect, useRef, useState } from 'react'
import ExcludedFolders from './excluded-folders'

interface SettingsTabProps {
	excludedFolders: string
	onSaveExcludedFolders: (excludedFolders: string) => void
}

const SettingsTab: React.FC<SettingsTabProps> = ({
	excludedFolders,
	onSaveExcludedFolders,
}) => {
	// Generic form draft state – scalable for future settings
	const [draft, setDraft] = useState<{ excludedFolders: string }>(() => ({
		excludedFolders,
	}))
	const [isDirty, setIsDirty] = useState(false)
	const [showSaved, setShowSaved] = useState(false)
	const savedTimerRef = useRef<number | null>(null)

	// Sync incoming prop to draft and reset dirty when saved externally
	useEffect(() => {
		setDraft({ excludedFolders })
		setIsDirty(false)
	}, [excludedFolders])

	const handleChange = (field: keyof typeof draft, value: string) => {
		setDraft((prev) => {
			const next = { ...prev, [field]: value }
			setIsDirty(next.excludedFolders !== excludedFolders)
			return next
		})
	}

	const handleSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
		e.preventDefault()
		onSaveExcludedFolders(draft.excludedFolders)
		setIsDirty(false)
		// show a brief toast/label
		setShowSaved(true)
		if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current)
		savedTimerRef.current = window.setTimeout(() => {
			setShowSaved(false)
			savedTimerRef.current = null
		}, 1500)
	}

	// Fallback for environments where custom element submit doesn't propagate
	const handleExplicitSaveClick: React.MouseEventHandler = (e) => {
		e.preventDefault()
		if (!isDirty) return
		onSaveExcludedFolders(draft.excludedFolders)
		setIsDirty(false)
		setShowSaved(true)
		if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current)
		savedTimerRef.current = window.setTimeout(() => {
			setShowSaved(false)
			savedTimerRef.current = null
		}, 1500)
	}

	return (
		<div className="py-2">
			<form
				id="settings-form"
				className="flex flex-col gap-y-3 min-h-full"
				onSubmit={handleSubmit}
			>
				<ExcludedFolders
					excludedFolders={draft.excludedFolders}
					onChangeExcludedFolders={(v) => handleChange('excludedFolders', v)}
				/>

				{/* Sticky footer with bottom-left Save button */}
				<div className="sticky bottom-0 left-0 bg-bg border-t border-[var(--vscode-panel-border)] pt-2 pb-2 flex items-center gap-x-3">
					<vscode-button
						type="submit"
						disabled={!isDirty}
						onClick={handleExplicitSaveClick}
					>
						Save
					</vscode-button>
					{showSaved && (
						<span className="text-xs text-muted">Settings saved</span>
					)}
				</div>
			</form>
		</div>
	)
}

export default SettingsTab

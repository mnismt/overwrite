import { useEffect, useRef, useState } from 'react'
import ExcludedFolders from './excluded-folders'
import RespectGitignoreToggle from './respect-gitignore-toggle'

interface SettingsTabProps {
	excludedFolders: string
	readGitignore: boolean
	onSaveSettings: (payload: {
		excludedFolders: string
		readGitignore: boolean
	}) => void
}

const SettingsTab: React.FC<SettingsTabProps> = ({
	excludedFolders,
	readGitignore,
	onSaveSettings,
}) => {
	// Generic form draft state – scalable for future settings
	const [draft, setDraft] = useState<{
		excludedFolders: string
		readGitignore: boolean
	}>(() => ({ excludedFolders, readGitignore }))
	const [isDirty, setIsDirty] = useState(false)
	const [showSaved, setShowSaved] = useState(false)
	const savedTimerRef = useRef<number | null>(null)

	// Sync incoming prop to draft and reset dirty when saved externally
	useEffect(() => {
		setDraft({ excludedFolders, readGitignore })
		setIsDirty(false)
	}, [excludedFolders, readGitignore])

	const handleChange = (field: keyof typeof draft, value: string | boolean) => {
		setDraft((prev) => {
			const next = { ...prev, [field]: value } as typeof prev
			setIsDirty(
				next.excludedFolders !== excludedFolders ||
					next.readGitignore !== readGitignore,
			)
			return next
		})
	}

	const handleSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
		e.preventDefault()
		onSaveSettings({
			excludedFolders: draft.excludedFolders,
			readGitignore: draft.readGitignore,
		})
		setIsDirty(false)
		// show a brief toast/label
		setShowSaved(true)
		if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current)
		savedTimerRef.current = window.setTimeout(() => {
			setShowSaved(false)
			savedTimerRef.current = null
		}, 1500)
	}

	// No explicit onClick fallback to avoid double-submit; rely on form submit

	return (
		<div className="py-2">
			<vscode-label className="block mb-1">Settings</vscode-label>
			<form
				id="settings-form"
				className="flex flex-col gap-y-3 min-h-full"
				onSubmit={handleSubmit}
			>
				<ExcludedFolders
					excludedFolders={draft.excludedFolders}
					onChangeExcludedFolders={(v) => handleChange('excludedFolders', v)}
					onDraftChange={(v) => handleChange('excludedFolders', v)}
				/>

				<RespectGitignoreToggle
					checked={draft.readGitignore}
					onChange={(v) => handleChange('readGitignore', v)}
					onDraftChange={(v) => handleChange('readGitignore', v)}
				/>

				{/* Sticky footer with bottom-left Save button */}
				<div className="sticky bottom-0 left-0 bg-bg border-t border-[var(--vscode-panel-border)] pt-2 pb-2 flex items-center gap-x-3">
					<vscode-button
						type="submit"
						disabled={!isDirty}
						onClick={(e) => {
							// In some test/jsdom environments, custom elements don't submit forms by default.
							// Ensure we requestSubmit on the nearest form for reliability.
							const form = (e.currentTarget as unknown as HTMLElement).closest(
								'form',
							) as HTMLFormElement | null
							form?.requestSubmit()
						}}
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

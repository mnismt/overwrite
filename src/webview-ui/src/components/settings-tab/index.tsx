import ExcludedFolders from './excluded-folders'

interface SettingsTabProps {
	excludedFolders: string
	onSaveExcludedFolders: (excludedFolders: string) => void
}

const SettingsTab: React.FC<SettingsTabProps> = ({
	excludedFolders,
	onSaveExcludedFolders,
}) => {
	return (
		<div className="flex flex-col gap-y-3">
			<ExcludedFolders
				excludedFolders={excludedFolders}
				onSaveExcludedFolders={onSaveExcludedFolders}
			/>
		</div>
	)
}

export default SettingsTab

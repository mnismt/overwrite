import { useCallback, useEffect, useState } from 'react'
import type { VscodeTreeItem } from '../../../../types'
import { getVsCodeApi } from '../../utils/vscode'
import { countTokens } from './utils'
import CopyActions from './copy-actions'
import ExcludedFolders from './excluded-folders'
import FileExplorer from './file-explorer'
import TokenStats from './token-stats'
import UserInstructions from './user-instructions'

interface ContextTabProps {
	selectedCount: number
	onCopy: ({
		includeXml,
		userInstructions,
	}: {
		includeXml: boolean
		userInstructions: string
	}) => void
	fileTreeData: VscodeTreeItem[]
	selectedUris: Set<string>
	onSelect: (uris: Set<string>) => void
	onRefresh: (excludedFolders?: string) => void
	isLoading: boolean
	excludedFolders: string
	onSaveExcludedFolders: (excludedFolders: string) => void
}

const ContextTab: React.FC<ContextTabProps> = ({
	selectedCount,
	onCopy,
	fileTreeData,
	selectedUris,
	onSelect,
	onRefresh,
	isLoading,
	excludedFolders,
	onSaveExcludedFolders,
}) => {
	const [userInstructions, setUserInstructions] = useState('')
	const [searchQuery, setSearchQuery] = useState('')
	const [tokenStats, setTokenStats] = useState({
		fileTokensEstimate: 0,
		userInstructionsTokens: 0,
		totalTokens: 0,
		totalWithXmlTokens: 0,
	})
	const [actualTokenCounts, setActualTokenCounts] = useState<
		Record<string, number>
	>({})
	const [skippedFiles, setSkippedFiles] = useState<
		Array<{ uri: string; reason: string; message?: string }>
	>([])

	// Debounce timer for user instructions token counting
	const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(
		null,
	)

	// Constant for XML formatting instructions
	const XML_INSTRUCTIONS_TOKENS = 5000 // This is an approximation

	// Effect to calculate total tokens based on actual file counts and instructions
	useEffect(() => {
		// Clear any existing timer
		if (debounceTimer) {
			clearTimeout(debounceTimer)
		}

		// Calculate file total immediately
		const fileTotal = Object.values(actualTokenCounts).reduce(
			(sum, count) => sum + count,
			0,
		)

		// Update file totals immediately
		setTokenStats((prev) => ({
			...prev,
			fileTokensEstimate: fileTotal,
			totalTokens: fileTotal + prev.userInstructionsTokens,
			totalWithXmlTokens:
				fileTotal + prev.userInstructionsTokens + XML_INSTRUCTIONS_TOKENS,
		}))

		// Debounce user instructions token counting
		const timer = setTimeout(async () => {
			const instructionsTokens = await countTokens(userInstructions)

			setTokenStats((prev) => ({
				...prev,
				userInstructionsTokens: instructionsTokens,
				totalTokens: fileTotal + instructionsTokens,
				totalWithXmlTokens:
					fileTotal + instructionsTokens + XML_INSTRUCTIONS_TOKENS,
			}))
		}, 500)

		setDebounceTimer(timer)

		// Cleanup function
		return () => {
			if (timer) {
				clearTimeout(timer)
			}
		}
	}, [actualTokenCounts, userInstructions, debounceTimer])

	// Effect to request token counts when selection changes
	useEffect(() => {
		const vscode = getVsCodeApi()
		// Convert Set to Array before sending
		const urisArray = Array.from(selectedUris)
		if (urisArray.length > 0) {
			// Only send if there are selected URIs
			vscode.postMessage({
				command: 'getTokenCounts',
				payload: { selectedUris: urisArray },
			})
		} else {
			// If no URIs are selected, clear the actualTokenCounts and skippedFiles
			setActualTokenCounts({})
			setSkippedFiles([])
		}
	}, [selectedUris])

	// Effect to listen for token count updates from the extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.command === 'updateTokenCounts') {
				setActualTokenCounts(message.payload.tokenCounts || {})
				setSkippedFiles(message.payload.skippedFiles || [])
			}
		}

		window.addEventListener('message', handleMessage)
		return () => window.removeEventListener('message', handleMessage)
	}, [])

	const handleRefreshClick = useCallback(() => {
		// Reset skipped files and token counts when refreshing to clear any deleted files
		setSkippedFiles([])
		setActualTokenCounts({})
		// Call the refresh function
		onRefresh(excludedFolders)
	}, [onRefresh, excludedFolders])

	return (
		<div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
			{/* Excluded Folders Section */}
			<ExcludedFolders
				excludedFolders={excludedFolders}
				onSaveExcludedFolders={onSaveExcludedFolders}
			/>

			{/* Explorer Top Bar */}
			<div
				style={{
					display: 'flex',
					marginBottom: '10px',
					alignItems: 'center',
				}}
			>
				<vscode-button onClick={handleRefreshClick} disabled={isLoading}>
					<span slot="start" className="codicon codicon-refresh" />
					{isLoading ? 'Loading...' : 'Refresh'}
				</vscode-button>
				<vscode-textfield
					placeholder="Search files..."
					style={{ marginLeft: '10px', flexGrow: 1 }}
					value={searchQuery}
					onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
				>
					<span slot="start" className="codicon codicon-search" />
				</vscode-textfield>
			</div>

			{/* File Explorer */}
			<FileExplorer
				fileTreeData={fileTreeData}
				selectedUris={selectedUris}
				onSelect={onSelect}
				isLoading={isLoading}
				searchQuery={searchQuery}
				onSearchChange={setSearchQuery}
				actualTokenCounts={actualTokenCounts}
			/>

			{/* Copy Actions and Selected Count */}
			<CopyActions
				selectedCount={selectedCount}
				onCopy={onCopy}
				userInstructions={userInstructions}
			/>

			{/* Token Statistics */}
			<TokenStats tokenStats={tokenStats} skippedFiles={skippedFiles} />

			{/* User Instructions */}
			<UserInstructions
				userInstructions={userInstructions}
				onUserInstructionsChange={setUserInstructions}
			/>
		</div>
	)
}

export default ContextTab
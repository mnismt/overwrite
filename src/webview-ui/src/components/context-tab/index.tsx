import { useCallback, useEffect, useRef, useState } from 'react'
import type { VscodeTreeItem } from '../../types'
import { getVsCodeApi } from '../../utils/vscode'
import CopyActions from './copy-actions'
import FileExplorer from './file-explorer/index'
import TokenStats from './token-stats'
import UserInstructions from './user-instructions'
import { cancelPendingTokenRequests, countTokens } from './utils'

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
}

const ContextTab: React.FC<ContextTabProps> = ({
	selectedCount,
	onCopy,
	fileTreeData,
	selectedUris,
	onSelect,
	onRefresh,
	isLoading,
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

	// Debounce timer for user instructions token counting (use ref to avoid re-renders)
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const isMountedRef = useRef(true)

	// Constant for XML formatting instructions
	const XML_INSTRUCTIONS_TOKENS = 5000 // This is an approximation

	// Effect to track mount status
	useEffect(() => {
		isMountedRef.current = true
		return () => {
			isMountedRef.current = false
		}
	}, [])

	// Effect to calculate total tokens based on actual file counts and instructions
	useEffect(() => {
		// Clear any existing timer
		if (debounceRef.current !== null) {
			clearTimeout(debounceRef.current)
			debounceRef.current = null
		}

		// Calculate file total immediately with error handling
		let fileTotal = 0
		try {
			fileTotal = Object.values(actualTokenCounts).reduce(
				(sum, count) =>
					sum + (typeof count === 'number' && !Number.isNaN(count) ? count : 0),
				0,
			)
		} catch (error) {
			console.error('[ContextTab] Error calculating file tokens:', error)
			fileTotal = 0
		}

		// Update file totals immediately only if mounted
		if (isMountedRef.current) {
			setTokenStats((prev) => ({
				...prev,
				fileTokensEstimate: fileTotal,
				totalTokens: fileTotal + prev.userInstructionsTokens,
				totalWithXmlTokens:
					fileTotal + prev.userInstructionsTokens + XML_INSTRUCTIONS_TOKENS,
			}))
		}

		// Debounce user instructions token counting
		const timer = setTimeout(async () => {
			if (!isMountedRef.current) return

			try {
				const instructionsTokens = await countTokens(userInstructions)

				if (isMountedRef.current) {
					setTokenStats((prev) => ({
						...prev,
						userInstructionsTokens: instructionsTokens,
						totalTokens: fileTotal + instructionsTokens,
						totalWithXmlTokens:
							fileTotal + instructionsTokens + XML_INSTRUCTIONS_TOKENS,
					}))
				}
			} catch (error) {
				console.error('[ContextTab] Error counting instruction tokens:', error)
				// Keep previous instruction tokens on error
			}
		}, 500)

		debounceRef.current = timer

		// Cleanup function
		return () => {
			if (debounceRef.current !== null) {
				clearTimeout(debounceRef.current)
				debounceRef.current = null
			}
		}
	}, [actualTokenCounts, userInstructions])

	// Debounced request for token counts on selection changes with proper cancellation
	const tokenRequestRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const tokenRequestIdRef = useRef<string | null>(null)
	const latestSelectionRef = useRef(selectedUris)

	// Stable reference to avoid recreating on every render
	const normalizeSelection = useCallback((uris: string[]) => {
		return [...uris].sort((a, b) => a.localeCompare(b)).join('||')
	}, [])

	useEffect(() => {
		latestSelectionRef.current = selectedUris
	}, [selectedUris])

	useEffect(() => {
		const vscode = getVsCodeApi()
		const urisArray = Array.from(selectedUris)
		const targetSelectionKey = normalizeSelection(urisArray)

		// Clear previous request and mark it as stale
		if (tokenRequestRef.current !== null) {
			clearTimeout(tokenRequestRef.current)
			tokenRequestRef.current = null
		}
		// Mark previous request ID as stale
		tokenRequestIdRef.current = null

		if (urisArray.length === 0) {
			setActualTokenCounts({})
			setSkippedFiles([])
			return
		}

		// Debounce the request
		tokenRequestRef.current = globalThis.setTimeout(() => {
			// Double-check we're still requesting for the latest selection
			const currentUris = Array.from(latestSelectionRef.current)
			if (normalizeSelection(currentUris) === targetSelectionKey) {
				// Generate unique request ID for tracking
				const requestId = `token_counts_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
				tokenRequestIdRef.current = requestId

				vscode.postMessage({
					command: 'getTokenCounts',
					payload: { selectedUris: currentUris, requestId },
				})
			}
			tokenRequestRef.current = null
		}, 300)

		return () => {
			if (tokenRequestRef.current !== null) {
				clearTimeout(tokenRequestRef.current)
				tokenRequestRef.current = null
			}
			// Don't clear tokenRequestIdRef here - let the message handler check staleness
		}
	}, [selectedUris, normalizeSelection])

	// Effect to listen for token count updates from the extension
	// Use ref to avoid stale closure issues
	const tokenCountsRef = useRef(actualTokenCounts)
	const skippedFilesRef = useRef(skippedFiles)

	useEffect(() => {
		tokenCountsRef.current = actualTokenCounts
		skippedFilesRef.current = skippedFiles
	}, [actualTokenCounts, skippedFiles])

	// Check if token count response is stale
	const isStaleResponse = useCallback(
		(responseRequestId: string | undefined): boolean => {
			const currentRequestId = tokenRequestIdRef.current
			if (
				responseRequestId &&
				currentRequestId &&
				responseRequestId !== currentRequestId
			) {
				console.debug('[ContextTab] Ignoring stale token count response', {
					responseRequestId,
					currentRequestId,
				})
				return true
			}
			return false
		},
		[],
	)

	// Compare token counts for changes
	const hasTokenCountsChanged = useCallback(
		(incoming: Record<string, number>): boolean => {
			const currentCounts = tokenCountsRef.current
			const incomingKeys = Object.keys(incoming)
			const currentKeys = Object.keys(currentCounts)

			// Check if lengths differ
			if (incomingKeys.length !== currentKeys.length) {
				return true
			}

			// Check if any values changed
			return incomingKeys.some((k) => currentCounts[k] !== incoming[k])
		},
		[],
	)

	// Process token counts update
	const processTokenCountsUpdate = useCallback(
		(
			tokenCounts: Record<string, number>,
			skippedFiles: Array<{ uri: string; reason: string; message?: string }>,
		) => {
			if (hasTokenCountsChanged(tokenCounts) && isMountedRef.current) {
				setActualTokenCounts(tokenCounts)
			}

			const skippedChanged =
				JSON.stringify(skippedFiles) !== JSON.stringify(skippedFilesRef.current)
			if (skippedChanged && isMountedRef.current) {
				setSkippedFiles(skippedFiles)
			}
		},
		[hasTokenCountsChanged],
	)

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.command !== 'updateTokenCounts') {
				return
			}

			const responseRequestId = message.payload?.requestId
			if (isStaleResponse(responseRequestId)) {
				return
			}

			// Clear request ID after processing
			if (responseRequestId === tokenRequestIdRef.current) {
				tokenRequestIdRef.current = null
			}

			const incoming: Record<string, number> = message.payload.tokenCounts || {}
			const incomingSkipped = message.payload.skippedFiles || []

			processTokenCountsUpdate(incoming, incomingSkipped)
		}
		window.addEventListener('message', handleMessage)
		return () => window.removeEventListener('message', handleMessage)
	}, [isStaleResponse, processTokenCountsUpdate])

	const handleRefreshClick = useCallback(() => {
		// Reset skipped files when refreshing to clear any deleted files
		setSkippedFiles([])
		// Don't reset actualTokenCounts here - let the effect handle cleaning up invalid entries
		// after the new tree arrives. This prevents the UI from showing 0 tokens during refresh.

		// Call the refresh function (use persisted excluded folders on backend)
		onRefresh()
	}, [onRefresh])

	const getSkipReasonLabel = (reason: string, message?: string): string => {
		let label: string

		if (reason === 'binary') {
			label = 'Binary file'
		} else if (reason === 'too-large') {
			label = 'Too large'
		} else {
			label = 'Error'
		}

		return message ? `${label} (${message})` : label
	}

	// Effect to clean up token counts for files that no longer exist after tree refresh
	useEffect(() => {
		if (fileTreeData.length === 0) return

		// Build set of all valid URIs in the current tree
		const validUris = new Set<string>()
		const collectUris = (items: VscodeTreeItem[]) => {
			for (const item of items) {
				validUris.add(item.value)
				if (item.subItems) {
					collectUris(item.subItems)
				}
			}
		}
		collectUris(fileTreeData)

		// Remove token counts for URIs that no longer exist in the tree
		setActualTokenCounts((prev) => {
			const cleaned: Record<string, number> = {}
			let hasChanges = false

			for (const [uri, count] of Object.entries(prev)) {
				if (validUris.has(uri)) {
					cleaned[uri] = count
				} else {
					hasChanges = true
				}
			}

			return hasChanges ? cleaned : prev
		})
	}, [fileTreeData])

	// Cleanup effect: cancel pending token requests on unmount
	useEffect(() => {
		return () => {
			cancelPendingTokenRequests()
		}
	}, [])

	return (
		<div className="flex flex-col h-full overflow-hidden gap-y-2 py-2 pb-20">
			{/* Sticky header area (tabs are outside this component; keep this non-scrolling) */}
			<div className="bg-bg z-10">
				{/* User Instructions at top */}
				<UserInstructions
					userInstructions={userInstructions}
					onUserInstructionsChange={setUserInstructions}
				/>

				{/* Explorer Top Bar */}
				<div className="mt-2 mb-2 flex items-center">
					<vscode-button
						onClick={handleRefreshClick}
						disabled={isLoading}
						className="transition-all duration-200 ease-out"
					>
						<span
							slot="start"
							className={`codicon codicon-refresh transition-transform duration-500 ${isLoading ? 'animate-spin' : ''}`}
						/>
						{isLoading ? 'Loading...' : 'Refresh'}
					</vscode-button>
					<vscode-textfield
						placeholder="Search files..."
						className="ml-2 flex-1"
						value={searchQuery}
						onInput={(e) =>
							setSearchQuery((e.target as HTMLInputElement).value)
						}
					>
						<span slot="start" className="codicon codicon-search" />
					</vscode-textfield>
				</div>
			</div>

			{/* Scrollable tree area only */}
			<div
				data-testid="context-tree-scroll"
				className="flex-1 min-h-0 overflow-auto pb-24"
			>
				{/* File Explorer */}
				<div
					className={`transition-opacity duration-300 ${isLoading ? 'opacity-95' : 'opacity-100'}`}
				>
					<FileExplorer
						fileTreeData={fileTreeData}
						selectedUris={selectedUris}
						onSelect={onSelect}
						isLoading={isLoading}
						searchQuery={searchQuery}
						actualTokenCounts={actualTokenCounts}
					/>
				</div>

				{/* Skipped files disclosure (scrolls with tree) */}
				{skippedFiles.length > 0 && (
					<details className="mt-2 text-xs text-error bg-warn-bg border border-warn-border rounded px-2 py-2">
						<summary className="cursor-pointer list-none">
							⚠️ Skipped Files ({skippedFiles.length})
						</summary>
						<div className="mt-1">
							{skippedFiles.map((file) => (
								<div key={file.uri} className="mb-0.5">
									<span className="font-mono">{file.uri.split('/').pop()}</span>
									{' - '}
									<span className="italic">
										{getSkipReasonLabel(file.reason, file.message)}
									</span>
								</div>
							))}
						</div>
					</details>
				)}
			</div>

			{/* Fixed footer with compact tokens + actions */}
			<div className="fixed bottom-0 left-0 right-0 border-t bg-bg/95 backdrop-blur px-3 py-2 z-10">
				<div className="flex items-center gap-3 h-full">
					<TokenStats
						selectedCount={selectedCount}
						className="flex-grow"
						tokenStats={tokenStats}
						skippedFiles={[]}
					/>
					<CopyActions
						onCopy={({ includeXml: inc, userInstructions }) =>
							onCopy({ includeXml: inc, userInstructions })
						}
						userInstructions={userInstructions}
					/>
				</div>
			</div>
		</div>
	)
}

export default ContextTab

import * as vscode from 'vscode'

import path from 'node:path'
import {
	generateFileContents,
	generateFileMap,
	generatePrompt,
} from '../../prompts'
import { telemetry } from '../../services/telemetry'
import {
	clearCache,
	countManyWithInfo,
	encodeText,
} from '../../services/token-counter'
import type { VscodeTreeItem } from '../../types'
import { getWorkspaceFileTree } from '../../utils/file-system'
import { getLanguageIdFromPath } from '../../utils/language-detection'
import { parseXmlResponse } from '../../utils/xml-parser'
import { applyFileActions } from './file-action-handler'
import { getHtmlForWebview } from './html-generator'
import type {
	CopyContextPayload,
	FileAction,
	FileActionChange,
	GetFileTreePayload,
	GetTokenCountsPayload,
	OpenFilePayload,
	SaveSettingsPayload,
	UpdateSettingsPayload,
} from './types'

export class FileExplorerWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'overwriteFilesWebview'

	private _view?: vscode.WebviewView
	private readonly _context: vscode.ExtensionContext
	private _fullTreeCache: VscodeTreeItem[] = [] // Cache for the full file tree
	private _isBuildingTree = false // Prevent overlapping tree builds
	private _treeBuildTimeout: NodeJS.Timeout | null = null // Timeout for tree building
	private _treeBuildAbortController: AbortController | null = null // Abort controller for cancellation
	// Always-excluded patterns that never show in the UI; keep minimal (.git only)
	private readonly _excludedDirs = ['.git', '.hg', '.svn']
	private static readonly EXCLUDED_FOLDERS_KEY = 'overwrite.excludedFolders'
	private static readonly READ_GITIGNORE_KEY = 'overwrite.readGitignore'

	constructor(
		private readonly _extensionUri: vscode.Uri,
		context: vscode.ExtensionContext,
	) {
		this._context = context
	}

	/** Saves excluded folders to workspace state. */
	private async _saveExcludedFolders(excludedFolders: string): Promise<void> {
		await this._context.workspaceState.update(
			FileExplorerWebviewProvider.EXCLUDED_FOLDERS_KEY,
			excludedFolders,
		)
	}

	/** Loads excluded folders from workspace state. */
	private _loadExcludedFolders(): string {
		return this._context.workspaceState.get(
			FileExplorerWebviewProvider.EXCLUDED_FOLDERS_KEY,
			'',
		)
	}

	/** Saves both settings to workspace state. */
	private async _saveSettings(payload: SaveSettingsPayload): Promise<void> {
		await this._context.workspaceState.update(
			FileExplorerWebviewProvider.EXCLUDED_FOLDERS_KEY,
			payload.excludedFolders,
		)
		await this._context.workspaceState.update(
			FileExplorerWebviewProvider.READ_GITIGNORE_KEY,
			payload.readGitignore,
		)
	}

	/** Loads both settings from workspace state with defaults. */
	private _loadSettings(): UpdateSettingsPayload {
		const excludedFolders = this._loadExcludedFolders()
		const readGitignore = this._context.workspaceState.get(
			FileExplorerWebviewProvider.READ_GITIGNORE_KEY,
			true,
		)
		return { excludedFolders, readGitignore }
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView

		// Allow scripts and setup resource roots
		const isDevelopment =
			this._context.extensionMode === vscode.ExtensionMode.Development
		const localResourceRoots = [
			vscode.Uri.joinPath(this._extensionUri, 'dist'),
			vscode.Uri.joinPath(this._extensionUri, 'node_modules'),
		]
		if (isDevelopment) {
			// Allow connection to Vite dev server
			localResourceRoots.push(vscode.Uri.parse('http://localhost:5173'))
		}

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: localResourceRoots,
		}

		webviewView.webview.html = getHtmlForWebview(
			webviewView.webview,
			this._extensionUri,
			isDevelopment,
		)

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(async (message) => {
			console.log('Message received from webview:', message)
			try {
				switch (message.command) {
					case 'webviewError':
						// Track webview errors sent from the frontend
						try {
							const errorData = message.payload as {
								error: string
								stack?: string
								context?: string
							}
							telemetry.trackUnhandled('webview', new Error(errorData.error))
						} catch (e) {
							console.warn('[telemetry] failed to track webview error', e)
						}
						break
					case 'getFileTree':
						// Payload may contain excluded folders
						await this._handleGetFileTree(message.payload as GetFileTreePayload)
						break
					case 'getSettings':
						await this._handleGetSettings()
						break
					case 'saveSettings':
						await this._handleSaveSettings(
							message.payload as SaveSettingsPayload,
						)
						break
					case 'saveExcludedFolders':
						// Save excluded folders to workspace state
						await this._handleSaveExcludedFolders(
							message.payload as { excludedFolders: string },
						)
						break
					case 'getExcludedFolders':
						// Send persisted excluded folders to webview
						await this._handleGetExcludedFolders()
						break
					case 'getTokenCounts': // Add handler for new command
						await this._handleGetTokenCounts(message.payload)
						break
					case 'getTokenCount': // Handle single token count request from webview
						await this._handleGetTokenCount(message.payload)
						break
					case 'openFile':
						// Type assertion or validation recommended here
						await this._handleOpenFile(message.payload as OpenFilePayload)
						break
					case 'copyContext':
					case 'copyContextXml':
						// Type assertion or validation recommended here
						await this._handleCopyContext(
							message.payload as CopyContextPayload,
							message.command === 'copyContextXml', // Pass boolean directly
						)
						break

					case 'applyChanges':
						await this._handleApplyChanges(
							message.payload as { responseText: string },
						)
						break
					case 'previewChanges':
						await this._handlePreviewChanges(
							message.payload as { responseText: string },
						)
						break
					case 'applyRowChange':
						await this._handleApplyRowChange(
							message.payload as { responseText: string; rowIndex: number },
						)
						break
					case 'previewRowChange':
						await this._handlePreviewRowChange(
							message.payload as { responseText: string; rowIndex: number },
						)
						break
					case 'copyApplyErrors':
						await this._handleCopyApplyErrors(
							message.payload as { text: string },
						)
						break
					case 'refreshAfterApply':
						// Refresh tree và clean invalid selections
						await this._handleRefreshAfterApply()
						break
					default:
						console.warn('Received unknown message command:', message.command)
				}
			} catch (error: unknown) {
				this._handleError(error)
			}
		})
	}

	// --- Private Helper Methods ---

	/**
	 * Handles the 'previewChanges' message from the webview.
	 * Opens diff editors comparing current files to computed in-memory results.
	 */
	private async _handlePreviewChanges(payload: {
		responseText: string
	}): Promise<void> {
		if (!payload?.responseText) {
			vscode.window.showErrorMessage('No response text provided.')
			return
		}

		try {
			const parseResult = parseXmlResponse(payload.responseText)
			if (parseResult.errors.length > 0) {
				// Create minimal preview data with errors so PreviewTable can render
				const previewData = {
					rows: [],
					errors: parseResult.errors,
				}
				this._view?.webview.postMessage({
					command: 'previewChangesResult',
					success: false,
					errors: parseResult.errors,
					previewData,
				})
				vscode.window.showErrorMessage(
					`Error parsing XML: ${parseResult.errors[0]}`,
				)
				return
			}

			if (parseResult.fileActions.length === 0) {
				vscode.window.showWarningMessage(
					'No file actions found in the response.',
				)
				// Create minimal preview data with errors so PreviewTable can render
				const previewData = {
					rows: [],
					errors: ['No file actions found in the response.'],
				}
				this._view?.webview.postMessage({
					command: 'previewChangesResult',
					success: false,
					errors: ['No file actions found in the response.'],
					previewData,
				})
				return
			}

			// Optionally show plan
			if (parseResult.plan) {
				vscode.window.showInformationMessage(`Plan: ${parseResult.plan}`)
			}

			// Generate preview data for the table instead of opening diffs
			const { analyzeFileActions } = await import(
				'../../services/preview-analyzer.js'
			)
			const previewData = await analyzeFileActions(parseResult.fileActions)

			// Send preview data to webview
			this._view?.webview.postMessage({
				command: 'previewChangesResult',
				success: true,
				previewData,
			})
		} catch (error) {
			this._handleError(error, 'Error previewing changes')
			// Create minimal preview data with errors so PreviewTable can render
			const errorMessage =
				error instanceof Error ? error.message : String(error)
			const previewData = {
				rows: [],
				errors: [errorMessage],
			}
			this._view?.webview.postMessage({
				command: 'previewChangesResult',
				success: false,
				errors: [errorMessage],
				previewData,
			})
		}
	}

	private _resolvePathToUriSafe(p: string, root?: string): vscode.Uri {
		// Reuse existing resolver via xml-parser path resolver used in file-action-handler
		// Minimal duplication to avoid cross-file refactor
		try {
			// Prefer the public resolver if available
			const { resolveXmlPathToUri } = require('../../utils/path-resolver')
			return resolveXmlPathToUri(p, root)
		} catch {
			// Fallback: try to resolve as workspace-relative or absolute
			if (path.isAbsolute(p)) return vscode.Uri.file(p)
			const folders = vscode.workspace.workspaceFolders
			if (!folders || folders.length === 0) return vscode.Uri.file(p)
			const base = root
				? (folders.find((f) => f.name === root)?.uri.fsPath ??
					folders[0].uri.fsPath)
				: folders[0].uri.fsPath
			return vscode.Uri.file(path.join(base, p))
		}
	}

	private _normalizeToEol(text: string, eol: string): string {
		const lf = text.replaceAll('\r\n', '\n')
		return eol === '\r\n' ? lf.replaceAll('\n', '\r\n') : lf
	}

	private _findNthOccurrence(
		haystack: string,
		needle: string,
		n: number,
	): number {
		let idx = -1
		let from = 0
		for (let i = 0; i < n; i++) {
			idx = haystack.indexOf(needle, from)
			if (idx === -1) return -1
			from = idx + needle.length
		}
		return idx
	}

	/**
	 * Handles errors by showing an error message to the user.
	 */
	private _handleError(
		error: unknown,
		contextMessage = 'An error occurred',
	): void {
		const errorMessage = error instanceof Error ? error.message : String(error)
		console.error(`${contextMessage}:`, error)
		vscode.window.showErrorMessage(`${contextMessage}: ${errorMessage}`)
	}

	/**
	 * Handles saving excluded folders to workspace state.
	 */
	private async _handleSaveExcludedFolders(payload: {
		excludedFolders: string
	}): Promise<void> {
		await this._saveExcludedFolders(payload.excludedFolders)
	}

	/**
	 * Handles getting excluded folders and sending them to webview.
	 */
	private async _handleGetExcludedFolders(): Promise<void> {
		if (!this._view) return

		const settings = this._loadSettings()
		// legacy message for compatibility
		this._view.webview.postMessage({
			command: 'updateExcludedFolders',
			payload: { excludedFolders: settings.excludedFolders },
		})
		// new combined settings message
		this._view.webview.postMessage({
			command: 'updateSettings',
			payload: settings,
		})
	}

	/** Handles getSettings and sends both values to webview. */
	private async _handleGetSettings(): Promise<void> {
		if (!this._view) return
		const settings = this._loadSettings()
		this._view.webview.postMessage({
			command: 'updateSettings',
			payload: settings,
		})
	}

	/** Persists settings and does not emit by itself (caller can refetch). */
	private async _handleSaveSettings(
		payload: SaveSettingsPayload,
	): Promise<void> {
		await this._saveSettings(payload)

		// Track settings saved event
		try {
			telemetry.captureSettings()
		} catch (e) {
			console.warn('[telemetry] failed to capture settings_saved', e)
		}
	}

	/**
	 * Fetches the file tree and sends it to the webview.
	 */
	private async _handleGetFileTree(
		payload?: GetFileTreePayload,
	): Promise<void> {
		if (!this._view) return

		try {
			// Cancel any existing tree build operation
			if (this._treeBuildAbortController) {
				this._treeBuildAbortController.abort()
				this._treeBuildAbortController = null
			}

			// Clear any existing timeout
			if (this._treeBuildTimeout) {
				clearTimeout(this._treeBuildTimeout)
				this._treeBuildTimeout = null
			}

			if (this._isBuildingTree) {
				// Set a timeout to prevent infinite blocking
				this._treeBuildTimeout = setTimeout(() => {
					this._isBuildingTree = false
					this._treeBuildTimeout = null
					if (this._treeBuildAbortController) {
						this._treeBuildAbortController.abort()
						this._treeBuildAbortController = null
					}
					console.warn('Tree building operation timed out after 30 seconds')
					this._view?.webview.postMessage({
						command: 'showError',
						message: 'Tree building operation timed out. Please try again.',
					})
					vscode.window.showErrorMessage(
						'Tree building operation timed out. Please try again.',
					)
				}, 30000) // 30 second timeout

				return
			}

			this._isBuildingTree = true

			// Create new abort controller for this operation
			this._treeBuildAbortController = new AbortController()
			const signal = this._treeBuildAbortController.signal

			// Set a timeout for this operation
			const timeoutPromise = new Promise<never>((_, reject) => {
				this._treeBuildTimeout = setTimeout(() => {
					reject(
						new Error('Tree building operation timed out after 30 seconds'),
					)
				}, 30000)
			})

			// Race the tree building against the timeout
			const excludedFoldersArray = payload?.excludedFolders
				? payload.excludedFolders
						.split(/\r?\n/)
						.map((line) => line.trim())
						.filter((line) => line.length > 0 && !line.startsWith('#'))
				: this._loadSettings()
						.excludedFolders.split(/\r?\n/)
						.map((line) => line.trim())
						.filter((line) => line.length > 0 && !line.startsWith('#'))

			// Combine with default excluded dirs
			const allExcludedDirs = [...this._excludedDirs, ...excludedFoldersArray]

			const workspaceFiles = await Promise.race([
				getWorkspaceFileTree(allExcludedDirs, {
					useGitignore:
						payload?.readGitignore ?? this._loadSettings().readGitignore,
				}),
				timeoutPromise,
			])

			// Check if operation was aborted
			if (signal.aborted) {
				console.debug('[FileExplorer] Tree build was cancelled')
				return
			}

			this._fullTreeCache = workspaceFiles // Cache the full tree
			this._view.webview.postMessage({
				command: 'updateFileTree',
				payload: workspaceFiles,
			})
		} catch (error) {
			// Check if error is due to abort
			if (error instanceof Error && error.name === 'AbortError') {
				console.debug('[FileExplorer] Tree build was cancelled')
				return
			}

			this._handleError(error, 'Error getting workspace files')
			// Optionally send specific error state to webview
			this._view.webview.postMessage({
				command: 'showError',
				message: `Error getting workspace files: ${
					error instanceof Error ? error.message : String(error)
				}`,
			})
		} finally {
			// Clear the flag and timeout
			this._isBuildingTree = false
			if (this._treeBuildTimeout) {
				clearTimeout(this._treeBuildTimeout)
				this._treeBuildTimeout = null
			}
			if (this._treeBuildAbortController) {
				this._treeBuildAbortController = null
			}
		}
	}

	/**
	 * Opens the specified file in the VS Code editor.
	 */
	private async _handleOpenFile(payload: OpenFilePayload): Promise<void> {
		try {
			const fileUriString = payload?.fileUri

			if (!fileUriString) {
				throw new Error('No file URI provided')
			}

			const fileUri = vscode.Uri.parse(fileUriString)

			// Check if the path is a file
			// No need to check if it's a directory, openTextDocument will handle it or error appropriately.
			// However, stat can confirm existence and type if needed before attempting to open.
			const fileStat = await vscode.workspace.fs.stat(fileUri)
			if (fileStat.type === vscode.FileType.File) {
				const document = await vscode.workspace.openTextDocument(fileUri)
				await vscode.window.showTextDocument(document)
			} else {
				console.log('File is not a file:', fileUri.fsPath)
			}
		} catch (error) {
			this._handleError(error, 'Error opening file')
		}
	}

	/**
	 * Generates the context string (with or without XML instructions) and copies it to the clipboard.
	 */
	private async _handleCopyContext(
		payload: CopyContextPayload,
		includeXml: boolean,
	): Promise<void> {
		try {
			const selectedUrisArray = Array.isArray(payload?.selectedUris)
				? payload.selectedUris
				: []
			// Store URIs as strings, as they come from webview. Parsing will happen as needed.
			const selectedUriStrings = new Set<string>(selectedUrisArray)

			if (selectedUriStrings.size === 0) {
				vscode.window.showWarningMessage(
					'No files selected. Please select files before copying.',
				)
				return // Exit early
			}

			const userInstructions =
				typeof payload?.userInstructions === 'string'
					? payload.userInstructions
					: ''

			console.log('Copy context details:', {
				selectedUris: Array.from(selectedUriStrings),
				userInstructions,
				includeXml,
			})

			// Ensure fullTreeCache is populated
			if (this._fullTreeCache.length === 0) {
				console.log('Full tree cache empty, fetching...')
				// Refetch if cache is empty (should ideally not happen if getFileTree was called)
				await this._handleGetFileTree()
				if (this._fullTreeCache.length === 0) {
					throw new Error('Failed to populate file tree cache.')
				}
			}

			// Generate components using imported functions
			// Note: generateFileMap and generateFileContents now handle multi-root workspaces via URI strings
			const fileMap = generateFileMap(
				this._fullTreeCache, // Use cached tree, which is now multi-root
				selectedUriStrings, // Pass Set of URI strings
			)
			const fileContents = await generateFileContents(
				selectedUriStrings, // Pass Set of URI strings
			)

			// Generate the final prompt
			const prompt = generatePrompt(
				fileMap,
				fileContents,
				userInstructions,
				includeXml,
			)

			// Copy to clipboard
			await vscode.env.clipboard.writeText(prompt)
			vscode.window.showInformationMessage('Context copied to clipboard!')

			// Track copy action with sampling (20%)
			try {
				// Count total tokens in the prompt
				const tokenCount = await encodeText(prompt)

				telemetry.captureCopyAction({
					token_count: tokenCount,
					source: includeXml ? 'context_xml' : 'context',
					selected_file_count: selectedUriStrings.size,
				})
			} catch (e) {
				console.warn('[telemetry] failed to capture copy action', e)
			}
		} catch (error) {
			this._handleError(error, 'Error generating or copying context')
		}
	}

	/**
	 * Handles the 'applyChanges' message from the webview.
	 */
	private async _handleApplyChanges(payload: {
		responseText: string
	}): Promise<void> {
		if (!payload?.responseText) {
			vscode.window.showErrorMessage('No response text provided.')
			return
		}

		const requestId = telemetry.generateRequestId()
		const startTime = Date.now()

		try {
			const parseResult = parseXmlResponse(payload.responseText)

			if (parseResult.errors.length > 0) {
				this._handleApplyParseError(parseResult.errors, requestId, startTime)
				return
			}

			if (parseResult.fileActions.length === 0) {
				this._handleApplyNoActions(requestId, startTime)
				return
			}

			await this._executeApplyActions(parseResult, requestId, startTime)
		} catch (error) {
			this._handleApplyExecutionError(error, requestId, startTime)
		}
	}

	private _handleApplyParseError(
		errors: string[],
		requestId: string,
		startTime: number,
	): void {
		const duration = Date.now() - startTime

		try {
			telemetry.captureApplyFlow('apply_failed', requestId, {
				duration_ms: duration,
				error_code: 'ParseError',
				files_touched_count: 0,
			})
		} catch (e) {
			console.warn('[telemetry] failed to capture apply_failed', e)
		}

		this._view?.webview.postMessage({
			command: 'applyChangesResult',
			success: false,
			errors,
		})

		vscode.window.showErrorMessage(`Error parsing XML: ${errors[0]}`)
	}

	private _handleApplyNoActions(requestId: string, startTime: number): void {
		const duration = Date.now() - startTime

		try {
			telemetry.captureApplyFlow('apply_failed', requestId, {
				duration_ms: duration,
				error_code: 'NoActions',
				files_touched_count: 0,
			})
		} catch (e) {
			console.warn('[telemetry] failed to capture apply_failed', e)
		}

		vscode.window.showWarningMessage('No file actions found in the response.')
		this._view?.webview.postMessage({
			command: 'applyChangesResult',
			success: false,
			errors: ['No file actions found in the response.'],
		})
	}

	private async _executeApplyActions(
		parseResult: { fileActions: FileAction[]; plan?: string },
		requestId: string,
		startTime: number,
	): Promise<void> {
		const diffHunkCount = this._countDiffHunks(parseResult.fileActions)

		try {
			telemetry.captureApplyFlow('apply_started', requestId, {
				planned_files_count: parseResult.fileActions.length,
				diff_hunk_count: diffHunkCount,
			})
		} catch (e) {
			console.warn('[telemetry] failed to capture apply_started', e)
		}

		if (parseResult.plan) {
			vscode.window.showInformationMessage(`Plan: ${parseResult.plan}`)
		}

		const results = await applyFileActions(parseResult.fileActions, this._view)
		const duration = Date.now() - startTime
		const successCount = results.filter((r) => r.success).length
		const totalCount = results.length

		try {
			telemetry.captureApplyFlow('apply_completed', requestId, {
				duration_ms: duration,
				files_touched_count: successCount,
				diff_hunk_count: diffHunkCount,
			})
		} catch (e) {
			console.warn('[telemetry] failed to capture apply_completed', e)
		}

		this._view?.webview.postMessage({
			command: 'applyChangesResult',
			success: true,
			results,
		})

		this._showApplySummary(successCount, totalCount)
	}

	private _countDiffHunks(fileActions: FileAction[]): number {
		return fileActions.reduce((count, action) => {
			if (action.action === 'modify' && action.changes) {
				return count + action.changes.length
			}
			return count
		}, 0)
	}

	private _showApplySummary(successCount: number, totalCount: number): void {
		if (successCount === totalCount) {
			vscode.window.showInformationMessage(
				`Successfully applied all ${totalCount} file operations.`,
			)
		} else {
			vscode.window.showWarningMessage(
				`Applied ${successCount} out of ${totalCount} file operations. See the Apply tab for details.`,
			)
		}
	}

	private _handleApplyExecutionError(
		error: unknown,
		requestId: string,
		startTime: number,
	): void {
		const duration = Date.now() - startTime

		try {
			telemetry.captureApplyFlow('apply_failed', requestId, {
				duration_ms: duration,
				error_code: error instanceof Error ? error.name : 'Error',
				files_touched_count: 0,
			})
		} catch (e) {
			console.warn('[telemetry] failed to capture apply_failed', e)
		}

		this._handleError(error, 'Error applying changes')
		this._view?.webview.postMessage({
			command: 'applyChangesResult',
			success: false,
			errors: [error instanceof Error ? error.message : String(error)],
		})
	}

	/**
	 * Handles the 'applyRowChange' message from the webview.
	 * Applies a single file action specified by rowIndex.
	 */
	private async _handleApplyRowChange(payload: {
		responseText: string
		rowIndex: number
	}): Promise<void> {
		if (!payload?.responseText) {
			vscode.window.showErrorMessage('No response text provided.')
			return
		}

		try {
			// Parse the XML response
			const parseResult = parseXmlResponse(payload.responseText)

			// If there are parsing errors, show them to the user
			if (parseResult.errors.length > 0) {
				this._view?.webview.postMessage({
					command: 'applyRowChangeResult',
					success: false,
					errors: parseResult.errors,
				})
				vscode.window.showErrorMessage(
					`Error parsing XML: ${parseResult.errors[0]}`,
				)
				return
			}

			// If there are no file actions, warn the user
			if (parseResult.fileActions.length === 0) {
				this._view?.webview.postMessage({
					command: 'applyRowChangeResult',
					success: false,
					errors: ['No file actions found in the response.'],
				})
				return
			}

			// Check if rowIndex is valid
			if (
				payload.rowIndex < 0 ||
				payload.rowIndex >= parseResult.fileActions.length
			) {
				this._view?.webview.postMessage({
					command: 'applyRowChangeResult',
					success: false,
					errors: [`Invalid row index: ${payload.rowIndex}`],
				})
				return
			}

			// Get the specific file action for this row
			const targetAction = parseResult.fileActions[payload.rowIndex]

			// Apply only this file action
			const results = await applyFileActions([targetAction], this._view)

			// Send results to webview
			this._view?.webview.postMessage({
				command: 'applyRowChangeResult',
				success: true,
				results,
			})

			// Show notification for single action
			const result = results[0]
			if (result?.success) {
				vscode.window.showInformationMessage(
					`Successfully applied ${result.action} to ${result.path}`,
				)
			} else {
				vscode.window.showErrorMessage(
					`Failed to apply ${targetAction.action} to ${targetAction.path}: ${
						result?.message || 'Unknown error'
					}`,
				)
			}
		} catch (error) {
			this._handleError(error, 'Error applying row change')
			this._view?.webview.postMessage({
				command: 'applyRowChangeResult',
				success: false,
				errors: [error instanceof Error ? error.message : String(error)],
			})
		}
	}

	private async _handlePreviewRowChange(payload: {
		responseText: string
		rowIndex: number
	}): Promise<void> {
		if (!payload?.responseText) {
			vscode.window.showErrorMessage('No response text provided.')
			return
		}

		try {
			const parseResult = parseXmlResponse(payload.responseText)

			if (parseResult.errors.length > 0) {
				this._sendPreviewRowError(parseResult.errors[0])
				return
			}

			if (
				!this._isValidRowIndex(payload.rowIndex, parseResult.fileActions.length)
			) {
				this._sendPreviewRowError(`Invalid row index: ${payload.rowIndex}`)
				return
			}

			const targetAction = parseResult.fileActions[payload.rowIndex]

			if (targetAction.action === 'rename') {
				this._handleRenamePreview()
				return
			}

			await this._showPreviewDiff(targetAction)
		} catch (error) {
			this._handleError(error, 'Error previewing row change')
			this._view?.webview.postMessage({
				command: 'previewRowChangeResult',
				success: false,
				errors: [error instanceof Error ? error.message : String(error)],
			})
		}
	}

	private _sendPreviewRowError(errorMessage: string): void {
		this._view?.webview.postMessage({
			command: 'previewRowChangeResult',
			success: false,
			errors: [errorMessage],
		})
		vscode.window.showErrorMessage(`Error: ${errorMessage}`)
	}

	private _isValidRowIndex(index: number, length: number): boolean {
		return index >= 0 && index < length
	}

	private _handleRenamePreview(): void {
		vscode.window.showWarningMessage(
			'Preview is not available for rename operations.',
		)
		this._view?.webview.postMessage({
			command: 'previewRowChangeResult',
			success: true,
		})
	}

	private async _showPreviewDiff(targetAction: FileAction): Promise<void> {
		const originalUri = await this._getOriginalUri(targetAction)
		const language = getLanguageIdFromPath(targetAction.path)
		const proposedText = await this._computeProposedText(
			targetAction,
			originalUri,
		)

		const { leftUri, rightDoc } = await this._buildDiffDocuments(
			targetAction,
			originalUri,
			language,
			proposedText,
		)

		await vscode.commands.executeCommand(
			'vscode.diff',
			leftUri,
			rightDoc.uri,
			`Preview: ${targetAction.action} ${targetAction.path}`,
		)

		this._view?.webview.postMessage({
			command: 'previewRowChangeResult',
			success: true,
		})
	}

	private async _getOriginalUri(
		targetAction: FileAction,
	): Promise<vscode.Uri | null> {
		try {
			const uri = this._resolvePathToUriSafe(
				targetAction.path,
				targetAction.root,
			)
			await vscode.workspace.fs.stat(uri)
			return uri
		} catch {
			return null
		}
	}

	private async _computeProposedText(
		targetAction: FileAction,
		originalUri: vscode.Uri | null,
	): Promise<string> {
		if (targetAction.action === 'create' || targetAction.action === 'rewrite') {
			return targetAction.changes?.[0]?.content ?? ''
		}

		if (targetAction.action === 'delete') {
			return ''
		}

		if (targetAction.action === 'modify') {
			return await this._applyModifyChanges(targetAction, originalUri)
		}

		return ''
	}

	private async _applyModifyChanges(
		targetAction: FileAction,
		originalUri: vscode.Uri | null,
	): Promise<string> {
		if (!originalUri) {
			throw new Error('Target file does not exist for modify action')
		}

		const document = await vscode.workspace.openTextDocument(originalUri)
		const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'
		let fullText = document.getText()

		for (const change of targetAction.changes ?? []) {
			fullText = this._applyModifyChange(change, fullText, eol)
		}

		return fullText
	}

	private _applyModifyChange(
		change: FileActionChange,
		fullText: string,
		eol: string,
	): string {
		if (!change.search) {
			throw new Error('Missing <search> for modify change')
		}

		const normalizedSearch = this._normalizeToEol(change.search, eol)
		let searchPos = fullText.indexOf(normalizedSearch)

		if (searchPos === -1) {
			throw new Error(
				`Search text not found: "${normalizedSearch.slice(0, 30)}..."`,
			)
		}

		searchPos = this._resolveSearchPosition(
			fullText,
			normalizedSearch,
			searchPos,
			change,
		)

		const before = fullText.slice(0, searchPos)
		const after = fullText.slice(searchPos + normalizedSearch.length)
		return `${before}${change.content}${after}`
	}

	private _resolveSearchPosition(
		fullText: string,
		normalizedSearch: string,
		initialPos: number,
		change: FileActionChange,
	): number {
		const nextPos = fullText.indexOf(normalizedSearch, initialPos + 1)
		if (nextPos === -1) {
			return initialPos
		}

		const occ = change.occurrence
		if (occ === 'last') {
			return fullText.lastIndexOf(normalizedSearch)
		}

		if (typeof occ === 'number' && occ > 0) {
			const nth = this._findNthOccurrence(fullText, normalizedSearch, occ)
			if (nth === -1) {
				throw new Error(`occurrence=${occ} not found for search`)
			}
			return nth
		}

		return initialPos
	}

	private async _buildDiffDocuments(
		targetAction: FileAction,
		originalUri: vscode.Uri | null,
		language: string,
		proposedText: string,
	): Promise<{ leftUri: vscode.Uri; rightDoc: vscode.TextDocument }> {
		const rightDoc = await vscode.workspace.openTextDocument({
			language,
			content: proposedText,
		})

		if (targetAction.action === 'create' || !originalUri) {
			const emptyLeft = await vscode.workspace.openTextDocument({
				language,
				content: '',
			})
			return { leftUri: emptyLeft.uri, rightDoc }
		}

		if (targetAction.action === 'delete') {
			const emptyRight = await vscode.workspace.openTextDocument({
				language,
				content: '',
			})
			return { leftUri: originalUri, rightDoc: emptyRight }
		}

		return { leftUri: originalUri, rightDoc }
	}

	/**
	 * Handles the 'getTokenCounts' message from the webview.
	 */
	private async _handleGetTokenCounts(
		payload: GetTokenCountsPayload,
	): Promise<void> {
		if (!this._view) return

		const requestId = telemetry.generateRequestId()
		const startTime = Date.now()

		// Extract client-provided request ID for tracking
		const clientRequestId = (payload as { requestId?: string })?.requestId

		try {
			const urisToCount = Array.isArray(payload?.selectedUris)
				? payload.selectedUris
				: []

			const uris = urisToCount.map((uriString) => vscode.Uri.parse(uriString))

			// Calculate total selected size for bucketing
			let totalSizeBytes = 0
			for (const uri of uris) {
				try {
					const stat = await vscode.workspace.fs.stat(uri)
					if (stat.type === vscode.FileType.File) {
						totalSizeBytes += stat.size
					}
				} catch {
					// Skip files that can't be accessed
				}
			}

			// Track token count started
			try {
				telemetry.captureTokenCount('token_count_started', requestId, {
					selected_file_count: uris.length,
					total_selected_size: telemetry.bucketFileSize(totalSizeBytes),
				})
			} catch (e) {
				console.warn('[telemetry] failed to capture token_count_started', e)
			}

			const { tokenCounts, skippedFiles } = await countManyWithInfo(uris)

			const duration = Date.now() - startTime
			const totalTokens = Object.values(tokenCounts).reduce(
				(sum, count) => sum + count,
				0,
			)

			// Track token count completed
			try {
				telemetry.captureTokenCount('token_count_completed', requestId, {
					duration_ms: duration,
					estimated_tokens_total: totalTokens,
					cache_hit: false, // Will be enhanced when cache hit tracking is added to token counter
				})
			} catch (e) {
				console.warn('[telemetry] failed to capture token_count_completed', e)
			}

			// Send the results back to the webview with request ID for tracking
			this._view.webview.postMessage({
				command: 'updateTokenCounts',
				payload: {
					tokenCounts,
					skippedFiles,
					requestId: clientRequestId, // Include client request ID
				},
			})

			// Log skipped files for debugging
			if (skippedFiles.length > 0) {
				console.log('Skipped files during token counting:', skippedFiles)
			}
		} catch (error) {
			const duration = Date.now() - startTime

			// Track token count failed
			try {
				telemetry.captureTokenCount('token_count_failed', requestId, {
					duration_ms: duration,
					error_code: error instanceof Error ? error.name : 'Error',
				})
			} catch (e) {
				console.warn('[telemetry] failed to capture token_count_failed', e)
			}

			this._handleError(error, 'Error calculating token counts')
			// Send empty counts back on error with request ID
			this._view.webview.postMessage({
				command: 'updateTokenCounts',
				payload: {
					tokenCounts: {},
					skippedFiles: [],
					requestId: clientRequestId,
				},
			})
		}
	}

	/**
	 * Handles the 'getTokenCount' message from the webview for single text token counting.
	 */
	private async _handleGetTokenCount(payload: {
		text: string
		requestId: string
	}): Promise<void> {
		if (!this._view) return

		const startTime = Date.now()

		try {
			const tokenCount = await encodeText(payload.text)

			const duration = Date.now() - startTime

			// Track single token count (minimal telemetry for text operations)
			try {
				telemetry.captureTokenCount(
					'token_count_completed',
					payload.requestId,
					{
						duration_ms: duration,
						estimated_tokens_total: tokenCount,
						cache_hit: false,
					},
				)
			} catch (e) {
				console.warn('[telemetry] failed to capture single token count', e)
			}

			// Send the response back to the webview
			this._view.webview.postMessage({
				command: 'tokenCountResponse',
				requestId: payload.requestId,
				tokenCount,
			})
		} catch (error) {
			const duration = Date.now() - startTime

			// Track token count failed for single text
			try {
				telemetry.captureTokenCount('token_count_failed', payload.requestId, {
					duration_ms: duration,
					error_code: error instanceof Error ? error.name : 'Error',
				})
			} catch (e) {
				console.warn(
					'[telemetry] failed to capture single token count failure',
					e,
				)
			}

			this._handleError(error, 'Error calculating token count for text')
			// Send fallback response
			this._view.webview.postMessage({
				command: 'tokenCountResponse',
				requestId: payload.requestId,
				tokenCount: Math.ceil(payload.text.length / 4), // Rough fallback estimate
			})
		}
	}

	private async _handleCopyApplyErrors(payload: {
		text?: string
	}): Promise<void> {
		const text = payload?.text
		if (!text || text.trim().length === 0) {
			return
		}

		try {
			await vscode.env.clipboard.writeText(text)
			vscode.window.showInformationMessage('Apply errors copied to clipboard.')
		} catch (error) {
			this._handleError(error, 'Failed to copy apply errors')
		}
	}

	/**
	 * Handle refresh after apply - clears cache and rebuilds tree
	 */
	private async _handleRefreshAfterApply(): Promise<void> {
		if (!this._view) return

		try {
			// 1. Clear token cache
			clearCache()

			// 2. Rebuild tree
			const settings = this._loadSettings()
			const excludedFoldersArray = settings.excludedFolders
				.split(/\r?\n/)
				.map((line) => line.trim())
				.filter((line) => line.length > 0 && !line.startsWith('#'))

			const allExcludedDirs = [...this._excludedDirs, ...excludedFoldersArray]

			const workspaceFiles = await getWorkspaceFileTree(allExcludedDirs, {
				useGitignore: settings.readGitignore,
			})

			this._fullTreeCache = workspaceFiles

			// 3. Send new tree to webview
			this._view.webview.postMessage({
				command: 'updateFileTreeAfterApply',
				payload: workspaceFiles,
			})
		} catch (error) {
			this._handleError(error, 'Error refreshing after apply')
		}
	}
}

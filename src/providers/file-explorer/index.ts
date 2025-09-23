import * as vscode from 'vscode'

import path from 'node:path'
import {
	generateFileContents,
	generateFileMap,
	generatePrompt,
} from '../../prompts'
import { countManyWithInfo, encodeText } from '../../services/token-counter'
import type { VscodeTreeItem } from '../../types'
import { getWorkspaceFileTree } from '../../utils/file-system'
import { getLanguageIdFromPath } from '../../utils/language-detection'
import { parseXmlResponse } from '../../utils/xml-parser'
import { applyFileActions } from './file-action-handler'
import { getHtmlForWebview } from './html-generator'
import type {
	CopyContextPayload,
	GetFileTreePayload,
	GetTokenCountsPayload,
	OpenFilePayload,
	SaveSettingsPayload,
	UpdateSettingsPayload,
} from './types'

export class FileExplorerWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'overwriteFilesWebview'

	private _view?: vscode.WebviewView
	private _context: vscode.ExtensionContext
	private _fullTreeCache: VscodeTreeItem[] = [] // Cache for the full file tree
	private _isBuildingTree = false // Prevent overlapping tree builds
	private _treeBuildTimeout: NodeJS.Timeout | null = null // Timeout for tree building
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
		context: vscode.WebviewViewResolveContext,
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
				this._view?.webview.postMessage({
					command: 'previewChangesResult',
					success: false,
					errors: parseResult.errors,
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
				this._view?.webview.postMessage({
					command: 'previewChangesResult',
					success: false,
					errors: ['No file actions found in the response.'],
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
			this._view?.webview.postMessage({
				command: 'previewChangesResult',
				success: false,
				errors: [error instanceof Error ? error.message : String(error)],
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
					folders[0]!.uri.fsPath)
				: folders[0]!.uri.fsPath
			return vscode.Uri.file(path.join(base, p))
		}
	}

	private _normalizeToEol(text: string, eol: string): string {
		const lf = text.replace(/\r\n/g, '\n')
		return eol === '\r\n' ? lf.replace(/\n/g, '\r\n') : lf
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
		// Optionally send error back to webview if needed
		// this._view?.webview.postMessage({ command: 'showError', message: `${contextMessage}: ${errorMessage}` });
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
	}

	/**
	 * Fetches the file tree and sends it to the webview.
	 */
	private async _handleGetFileTree(
		payload?: GetFileTreePayload,
	): Promise<void> {
		if (!this._view) return

		try {
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

			this._fullTreeCache = workspaceFiles // Cache the full tree
			this._view.webview.postMessage({
				command: 'updateFileTree',
				payload: workspaceFiles,
			})
		} catch (error) {
			this._handleError(error, 'Error getting workspace files')
			// Optionally send specific error state to webview
			this._view.webview.postMessage({
				command: 'showError',
				message: `Error getting workspace files: ${error instanceof Error ? error.message : String(error)}`,
			})
		} finally {
			// Clear the flag and timeout
			this._isBuildingTree = false
			if (this._treeBuildTimeout) {
				clearTimeout(this._treeBuildTimeout)
				this._treeBuildTimeout = null
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
			// const rootPath = this._getWorkspaceRootPath() // This will be removed or re-evaluated

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
			// TODO: Update generateFileMap and generateFileContents to handle selectedUriStrings and multi-root logic
			// For now, this will likely break or produce incorrect results until those functions are updated.
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

		try {
			// Parse the XML response
			const parseResult = parseXmlResponse(payload.responseText)

			// If there are parsing errors, show them to the user
			if (parseResult.errors.length > 0) {
				// Send errors back to webview
				this._view?.webview.postMessage({
					command: 'applyChangesResult',
					success: false,
					errors: parseResult.errors,
				})

				// Also show the first error in a notification
				vscode.window.showErrorMessage(
					`Error parsing XML: ${parseResult.errors[0]}`,
				)
				return
			}

			// If there are no file actions, warn the user
			if (parseResult.fileActions.length === 0) {
				vscode.window.showWarningMessage(
					'No file actions found in the response.',
				)
				this._view?.webview.postMessage({
					command: 'applyChangesResult',
					success: false,
					errors: ['No file actions found in the response.'],
				})
				return
			}

			// Show the plan if available
			if (parseResult.plan) {
				vscode.window.showInformationMessage(`Plan: ${parseResult.plan}`)
			}

			// Process each file action
			const results = await applyFileActions(
				parseResult.fileActions,
				// rootPath, // Removed rootPath argument
				this._view,
			)

			// Send results to webview
			this._view?.webview.postMessage({
				command: 'applyChangesResult',
				success: true,
				results,
			})

			// Show summary notification
			const successCount = results.filter((r) => r.success).length
			const totalCount = results.length

			if (successCount === totalCount) {
				vscode.window.showInformationMessage(
					`Successfully applied all ${totalCount} file operations.`,
				)
			} else {
				vscode.window.showWarningMessage(
					`Applied ${successCount} out of ${totalCount} file operations. See the Apply tab for details.`,
				)
			}
		} catch (error) {
			this._handleError(error, 'Error applying changes')
			this._view?.webview.postMessage({
				command: 'applyChangesResult',
				success: false,
				errors: [error instanceof Error ? error.message : String(error)],
			})
		}
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
					`Failed to apply ${targetAction.action} to ${targetAction.path}: ${result?.message || 'Unknown error'}`,
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

	/**
	 * Handles the 'getTokenCounts' message from the webview.
	 */
	private async _handleGetTokenCounts(
		payload: GetTokenCountsPayload,
	): Promise<void> {
		if (!this._view) return

		try {
			const urisToCount = Array.isArray(payload?.selectedUris)
				? payload.selectedUris
				: []

			const uris = urisToCount.map((uriString) => vscode.Uri.parse(uriString))
			const { tokenCounts, skippedFiles } = await countManyWithInfo(uris)

			// Send the results back to the webview
			this._view.webview.postMessage({
				command: 'updateTokenCounts',
				payload: { tokenCounts, skippedFiles },
			})

			// Log skipped files for debugging
			if (skippedFiles.length > 0) {
				console.log('Skipped files during token counting:', skippedFiles)
			}
		} catch (error) {
			this._handleError(error, 'Error calculating token counts')
			// Send empty counts back on error
			this._view.webview.postMessage({
				command: 'updateTokenCounts',
				payload: { tokenCounts: {}, skippedFiles: [] },
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

		try {
			const tokenCount = await encodeText(payload.text)

			// Send the response back to the webview
			this._view.webview.postMessage({
				command: 'tokenCountResponse',
				requestId: payload.requestId,
				tokenCount,
			})
		} catch (error) {
			this._handleError(error, 'Error calculating token count for text')
			// Send fallback response
			this._view.webview.postMessage({
				command: 'tokenCountResponse',
				requestId: payload.requestId,
				tokenCount: Math.ceil(payload.text.length / 4), // Rough fallback estimate
			})
		}
	}
}

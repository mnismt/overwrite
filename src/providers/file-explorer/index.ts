import * as vscode from 'vscode'

import path from 'node:path'
import {
	generateFileContents,
	generateFileMap,
	generatePrompt,
} from '../../prompts'
import type { VscodeTreeItem } from '../../types'
import { getWorkspaceFileTree } from '../../utils/file-system'
import { parseXmlResponse } from '../../utils/xml-parser'
import { applyFileActions } from './file-action-handler'
import { getHtmlForWebview } from './html-generator'
import type {
	CopyContextPayload,
	GetFileTreePayload,
	GetTokenCountsPayload,
	OpenFilePayload,
} from './types'

export class FileExplorerWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'aboveRepoFilesWebview'

	private _view?: vscode.WebviewView
	private _context: vscode.ExtensionContext
	private _fullTreeCache: VscodeTreeItem[] = [] // Cache for the full file tree
	private readonly _excludedDirs = [] // Directories to exclude
	private static readonly EXCLUDED_FOLDERS_KEY = 'aboveRepo.excludedFolders'

	constructor(
		private readonly _extensionUri: vscode.Uri,
		context: vscode.ExtensionContext,
	) {
		this._context = context
	}

	/**
	 * Saves excluded folders to workspace state.
	 */
	private async _saveExcludedFolders(excludedFolders: string): Promise<void> {
		await this._context.workspaceState.update(
			FileExplorerWebviewProvider.EXCLUDED_FOLDERS_KEY,
			excludedFolders,
		)
	}

	/**
	 * Loads excluded folders from workspace state.
	 */
	private _loadExcludedFolders(): string {
		return this._context.workspaceState.get(
			FileExplorerWebviewProvider.EXCLUDED_FOLDERS_KEY,
			'node_modules\n.git\ndist\nout\n.vscode-test', // Default value
		)
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

		const persistedExcludedFolders = this._loadExcludedFolders()
		this._view.webview.postMessage({
			command: 'updateExcludedFolders',
			payload: { excludedFolders: persistedExcludedFolders },
		})
	}

	/**
	 * Fetches the file tree and sends it to the webview.
	 */
	private async _handleGetFileTree(
		payload?: GetFileTreePayload,
	): Promise<void> {
		if (!this._view) return

		try {
			// Parse excluded folders from payload if provided, otherwise load from state
			const excludedFolders =
				payload?.excludedFolders || this._loadExcludedFolders()

			// Save excluded folders if they were provided in payload (user initiated refresh)
			if (payload?.excludedFolders) {
				await this._saveExcludedFolders(payload.excludedFolders)
			}

			const excludedFoldersArray = excludedFolders
				? excludedFolders
						.split(/\r?\n/)
						.map((line) => line.trim())
						.filter((line) => line.length > 0 && !line.startsWith('#'))
				: []

			// Combine with default excluded dirs
			const allExcludedDirs = [...this._excludedDirs, ...excludedFoldersArray]

			// Use the imported function, passing exclusions
			const workspaceFiles = await getWorkspaceFileTree(allExcludedDirs)
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
	 * Handles the 'getTokenCounts' message from the webview.
	 */
	private async _handleGetTokenCounts(
		payload: GetTokenCountsPayload,
	): Promise<void> {
		if (!this._view) return

		const tokenCounts: Record<string, number> = {} // Keys will be URI strings
		const errors: string[] = []

		// Dynamically import Tiktoken and ranks, and create encoder
		const { Tiktoken } = await import('js-tiktoken/lite')
		const { default: o200k_base } = await import('js-tiktoken/ranks/o200k_base')
		const enc = new Tiktoken(o200k_base)

		// Define countTokens locally within the async function scope
		const countTokensLocal = (text: string): number => {
			if (!text) return 0
			return enc.encode(text).length
		}

		try {
			const urisToCount = Array.isArray(payload?.selectedUris)
				? payload.selectedUris
				: []

			// Process URIs concurrently
			await Promise.all(
				urisToCount.map(async (uriString) => {
					try {
						const fileUri = vscode.Uri.parse(uriString)

						// Ensure it's a file before attempting to read
						const stats = await vscode.workspace.fs.stat(fileUri)
						if (stats.type === vscode.FileType.File) {
							const contentBuffer = await vscode.workspace.fs.readFile(fileUri)
							const content = Buffer.from(contentBuffer).toString('utf8')
							tokenCounts[uriString] = countTokensLocal(content) // Use URI string as key
						} else {
							// It's a directory or something else, assign 0 tokens
							tokenCounts[uriString] = 0
						}
					} catch (error) {
						// Log error but continue processing other files
						const errorMsg = `Error counting tokens for ${uriString}: ${error instanceof Error ? error.message : String(error)}`
						console.error(errorMsg)
						errors.push(errorMsg)
						// Set token count to 0 on error to avoid issues in the UI
						tokenCounts[uriString] = 0
					}
				}),
			)

			// Send the results back to the webview
			this._view.webview.postMessage({
				command: 'updateTokenCounts',
				payload: { tokenCounts },
			})

			// Optionally report errors
			if (errors.length > 0) {
				console.warn('Errors encountered during token counting:', errors)
			}
		} catch (error) {
			// Handle general errors (e.g., Tiktoken import failure)
			this._handleError(error, 'Error calculating token counts')
			// Send empty counts back on error
			this._view.webview.postMessage({
				command: 'updateTokenCounts',
				payload: { tokenCounts: {} }, // Send empty on failure
			})
		}
	}
}

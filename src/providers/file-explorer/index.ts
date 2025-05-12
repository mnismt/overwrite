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
import { getHtmlForWebview } from './html-generator'
import type { CopyContextPayload, OpenFilePayload } from './types'
import { applyFileActions } from './file-action-handler'

export class FileExplorerWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'aboveRepoFilesWebview'

	private _view?: vscode.WebviewView
	private _context: vscode.ExtensionContext
	private _fullTreeCache: VscodeTreeItem[] = [] // Cache for the full file tree
	private readonly _excludedDirs = [] // Directories to exclude

	constructor(
		private readonly _extensionUri: vscode.Uri,
		context: vscode.ExtensionContext,
	) {
		this._context = context
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
						// No payload expected for getFileTree
						await this._handleGetFileTree()
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
	 * Gets the root path of the first workspace folder.
	 * Throws an error if no workspace is open.
	 */
	private _getWorkspaceRootPath(): string {
		const workspaceFolders = vscode.workspace.workspaceFolders
		if (!workspaceFolders || workspaceFolders.length === 0) {
			throw new Error('No workspace folder is open.')
		}
		return workspaceFolders[0].uri.fsPath
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
	 * Fetches the file tree and sends it to the webview.
	 */
	private async _handleGetFileTree(): Promise<void> {
		if (!this._view) return

		try {
			// Use the imported function, passing exclusions
			const workspaceFiles = await getWorkspaceFileTree(this._excludedDirs)
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
			const filePath = payload?.filePath

			if (!filePath) {
				throw new Error('No file path provided')
			}

			const rootPath = this._getWorkspaceRootPath()
			const absoluteFilePath = path.isAbsolute(filePath)
				? filePath
				: path.join(rootPath, filePath)

			const fileUri = vscode.Uri.file(absoluteFilePath)

			// Check if the path is a file
			const fileStat = await vscode.workspace.fs.stat(fileUri)
			if (fileStat.type === vscode.FileType.File) {
				const document = await vscode.workspace.openTextDocument(fileUri)
				await vscode.window.showTextDocument(document)
			} else {
				vscode.window.showWarningMessage(`Ignoring directory: ${filePath}`)
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
			const rootPath = this._getWorkspaceRootPath()

			const selectedPathsArray = Array.isArray(payload?.selectedPaths)
				? payload.selectedPaths
				: []
			const selectedPaths = new Set<string>(selectedPathsArray)

			if (selectedPaths.size === 0) {
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
				selectedPaths: Array.from(selectedPaths),
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
			const fileMap = generateFileMap(
				this._fullTreeCache, // Use cached tree
				selectedPaths,
				rootPath,
			)
			const fileContents = await generateFileContents(selectedPaths, rootPath)

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
			// Get the workspace root path
			const rootPath = this._getWorkspaceRootPath()

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
				rootPath,
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
	private async _handleGetTokenCounts(payload: {
		selectedPaths: string[]
	}): Promise<void> {
		if (!this._view) return

		const tokenCounts: Record<string, number> = {}
		const errors: string[] = []
		let rootPath: string

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
			rootPath = this._getWorkspaceRootPath()

			const pathsToCount = Array.isArray(payload?.selectedPaths)
				? payload.selectedPaths
				: []

			console.log('Calculating token counts for:', pathsToCount)

			// Process paths concurrently
			await Promise.all(
				pathsToCount.map(async (relativePath) => {
					try {
						const absolutePath = path.isAbsolute(relativePath)
							? relativePath
							: path.join(rootPath, relativePath)
						const fileUri = vscode.Uri.file(absolutePath)

						// Ensure it's a file before attempting to read
						const stats = await vscode.workspace.fs.stat(fileUri)
						if (stats.type === vscode.FileType.File) {
							const contentBuffer = await vscode.workspace.fs.readFile(fileUri)
							const content = Buffer.from(contentBuffer).toString('utf8') // Fix Buffer.from
							tokenCounts[relativePath] = countTokensLocal(content) // Use local countTokens
						} else {
							// It's a directory or something else, assign 0 tokens
							tokenCounts[relativePath] = 0
						}
					} catch (error) {
						// Log error but continue processing other files
						const errorMsg = `Error counting tokens for ${relativePath}: ${error instanceof Error ? error.message : String(error)}`
						console.error(errorMsg)
						errors.push(errorMsg)
						// Set token count to 0 on error to avoid issues in the UI
						tokenCounts[relativePath] = 0
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
				// You might want to display a non-blocking warning
				// vscode.window.showWarningMessage(`Could not count tokens for ${errors.length} file(s).`);
			}
		} catch (error) {
			// Handle errors getting root path or other general errors
			this._handleError(error, 'Error calculating token counts')
			// Send empty counts back on error
			this._view.webview.postMessage({
				command: 'updateTokenCounts',
				payload: { tokenCounts: {} }, // Send empty on failure
			})
		}
	}
}

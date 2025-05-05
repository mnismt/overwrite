import * as vscode from 'vscode'

import path from 'node:path'
import {
	generateFileContents,
	generateFileMap,
	generatePrompt,
} from '../../prompts'
import type { VscodeTreeItem } from '../../types'
import { getWorkspaceFileTree } from '../../utils/file-system'
import { getHtmlForWebview } from './html-generator'
import type { CopyContextPayload, OpenFilePayload } from './types'

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
}

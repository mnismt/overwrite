import * as vscode from 'vscode'

import path from 'node:path'
import {
	generateFileContents,
	generateFileMap,
	generatePrompt,
} from '../../prompts'
import type { VscodeTreeItem } from '../../types'
import { getWorkspaceFileTree } from '../../utils/file-system'
import type { FileAction } from '../../utils/xml-parser'
import { parseXmlResponse } from '../../utils/xml-parser'
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
			const results = await this._processFileActions(
				parseResult.fileActions,
				rootPath,
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
	 * Processes the file actions extracted from the XML.
	 */
	private async _processFileActions(
		fileActions: FileAction[],
		rootPath: string,
	): Promise<
		Array<{ path: string; action: string; success: boolean; message: string }>
	> {
		const results: Array<{
			path: string
			action: string
			success: boolean
			message: string
		}> = []

		for (const fileAction of fileActions) {
			try {
				const absolutePath = path.isAbsolute(fileAction.path)
					? fileAction.path
					: path.join(rootPath, fileAction.path)

				const fileUri = vscode.Uri.file(absolutePath)

				switch (fileAction.action) {
					case 'create':
						await this._handleCreateAction(
							fileAction,
							fileUri,
							rootPath,
							results,
						)
						break

					case 'rewrite':
						await this._handleRewriteAction(
							fileAction,
							fileUri,
							rootPath,
							results,
						)
						break

					case 'modify':
						await this._handleModifyAction(
							fileAction,
							fileUri,
							rootPath,
							results,
						)
						break

					case 'delete':
						await this._handleDeleteAction(
							fileAction,
							fileUri,
							rootPath,
							results,
						)
						break

					case 'rename':
						await this._handleRenameAction(
							fileAction,
							fileUri,
							rootPath,
							results,
						)
						break

					default:
						results.push({
							path: fileAction.path,
							action: fileAction.action,
							success: false,
							message: `Unknown action: ${fileAction.action}`,
						})
				}
			} catch (error) {
				results.push({
					path: fileAction.path,
					action: fileAction.action,
					success: false,
					message: error instanceof Error ? error.message : String(error),
				})
			}
		}

		return results
	}

	/**
	 * Handles the 'create' file action.
	 */
	private async _handleCreateAction(
		fileAction: FileAction,
		fileUri: vscode.Uri,
		rootPath: string,
		results: Array<{
			path: string
			action: string
			success: boolean
			message: string
		}>,
	): Promise<void> {
		try {
			// Ensure we have a content block
			if (!fileAction.changes || fileAction.changes.length === 0) {
				throw new Error('No content provided for create action')
			}

			// Get the content from the first change block
			const content = fileAction.changes[0].content

			// Check if file already exists
			try {
				await vscode.workspace.fs.stat(fileUri)
				// If we get here, the file exists
				throw new Error('File already exists, cannot create')
			} catch (error) {
				// If error is because file doesn't exist, that's what we want
				if (
					!(
						error instanceof vscode.FileSystemError &&
						error.code === 'FileNotFound'
					)
				) {
					throw error
				}
			}

			// Ensure parent directory exists
			const dirUri = vscode.Uri.file(path.dirname(fileUri.fsPath))
			try {
				await vscode.workspace.fs.stat(dirUri)
			} catch (error) {
				// If directory doesn't exist, create it
				if (
					error instanceof vscode.FileSystemError &&
					error.code === 'FileNotFound'
				) {
					await vscode.workspace.fs.createDirectory(dirUri)
				} else {
					throw error
				}
			}

			// Write the file content
			await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'))

			results.push({
				path: fileAction.path,
				action: 'create',
				success: true,
				message: 'File created successfully',
			})
		} catch (error) {
			results.push({
				path: fileAction.path,
				action: 'create',
				success: false,
				message: error instanceof Error ? error.message : String(error),
			})
		}
	}

	/**
	 * Handles the 'modify' file action.
	 */
	private async _handleModifyAction(
		fileAction: FileAction,
		fileUri: vscode.Uri,
		rootPath: string,
		results: Array<{
			path: string
			action: string
			success: boolean
			message: string
		}>,
	): Promise<void> {
		if (!fileAction.changes || fileAction.changes.length === 0) {
			results.push({
				path: fileAction.path,
				action: 'modify',
				success: false,
				message: 'No changes provided for modify action',
			})
			return
		}

		let successCount = 0
		const changeResults: string[] = []

		// Create a workspace edit to batch all changes
		const workspaceEdit = new vscode.WorkspaceEdit()

		try {
			// Open the document to modify
			const document = await vscode.workspace.openTextDocument(fileUri)
			const fullText = document.getText()

			// Process each change block
			for (const change of fileAction.changes) {
				try {
					if (!change.search) {
						changeResults.push('Error: Search block missing in a change')
						continue
					}

					// Find the search text in the document
					const searchPos = fullText.indexOf(change.search)
					if (searchPos === -1) {
						changeResults.push(
							`Error: Search text not found: "${change.search.slice(0, 20)}..."`,
						)
						continue
					}

					// Check for ambiguous matches
					const nextPos = fullText.indexOf(change.search, searchPos + 1)
					if (nextPos !== -1) {
						changeResults.push(
							`Error: Ambiguous search text - found multiple matches: "${change.search.slice(0, 20)}..."`,
						)
						continue
					}

					// Calculate range of the text to replace
					const startPos = document.positionAt(searchPos)
					const endPos = document.positionAt(searchPos + change.search.length)
					const range = new vscode.Range(startPos, endPos)

					// Add the replacement to the workspace edit
					workspaceEdit.replace(fileUri, range, change.content)

					successCount++
					changeResults.push(`Success: Applied change: "${change.description}"`)
				} catch (changeError) {
					changeResults.push(
						`Error with change: ${changeError instanceof Error ? changeError.message : String(changeError)}`,
					)
				}
			}

			// Apply all changes if we have any successful ones
			if (successCount > 0) {
				await vscode.workspace.applyEdit(workspaceEdit)

				results.push({
					path: fileAction.path,
					action: 'modify',
					success: true,
					message: `Applied ${successCount}/${fileAction.changes.length} modifications. ${changeResults.join('; ')}`,
				})
			} else {
				results.push({
					path: fileAction.path,
					action: 'modify',
					success: false,
					message: `Failed to apply any modifications. ${changeResults.join('; ')}`,
				})
			}
		} catch (error) {
			results.push({
				path: fileAction.path,
				action: 'modify',
				success: false,
				message: error instanceof Error ? error.message : String(error),
			})
		}
	}

	/**
	 * Handles the 'rewrite' file action.
	 */
	private async _handleRewriteAction(
		fileAction: FileAction,
		fileUri: vscode.Uri,
		rootPath: string,
		results: Array<{
			path: string
			action: string
			success: boolean
			message: string
		}>,
	): Promise<void> {
		try {
			// Ensure we have a content block
			if (!fileAction.changes || fileAction.changes.length === 0) {
				throw new Error('No content provided for rewrite action')
			}

			// Get the content from the first change block
			const content = fileAction.changes[0].content

			// Check if file exists
			try {
				await vscode.workspace.fs.stat(fileUri)
			} catch (error) {
				throw new Error('File does not exist, cannot rewrite')
			}

			// Rewrite the file content
			await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'))

			results.push({
				path: fileAction.path,
				action: 'rewrite',
				success: true,
				message: 'File rewritten successfully',
			})
		} catch (error) {
			results.push({
				path: fileAction.path,
				action: 'rewrite',
				success: false,
				message: error instanceof Error ? error.message : String(error),
			})
		}
	}

	/**
	 * Handles the 'delete' file action.
	 */
	private async _handleDeleteAction(
		fileAction: FileAction,
		fileUri: vscode.Uri,
		rootPath: string,
		results: Array<{
			path: string
			action: string
			success: boolean
			message: string
		}>,
	): Promise<void> {
		try {
			// Check if file exists
			try {
				await vscode.workspace.fs.stat(fileUri)
			} catch (error) {
				throw new Error('File does not exist, cannot delete')
			}

			// Delete the file
			await vscode.workspace.fs.delete(fileUri, {
				recursive: true,
				useTrash: true, // Move to trash instead of permanently deleting
			})

			results.push({
				path: fileAction.path,
				action: 'delete',
				success: true,
				message: 'File deleted successfully (moved to trash)',
			})
		} catch (error) {
			results.push({
				path: fileAction.path,
				action: 'delete',
				success: false,
				message: error instanceof Error ? error.message : String(error),
			})
		}
	}

	/**
	 * Handles the 'rename' file action.
	 */
	private async _handleRenameAction(
		fileAction: FileAction,
		fileUri: vscode.Uri,
		rootPath: string,
		results: Array<{
			path: string
			action: string
			success: boolean
			message: string
			newPath?: string
		}>,
	): Promise<void> {
		try {
			if (!fileAction.newPath) {
				throw new Error('Missing new path for rename operation.')
			}
			const newUri = vscode.Uri.joinPath(
				vscode.Uri.file(rootPath),
				fileAction.newPath,
			)

			// Check if original file exists
			try {
				await vscode.workspace.fs.stat(fileUri)
			} catch (error) {
				throw new Error(
					`Original file '${fileAction.path}' does not exist, cannot rename.`,
				)
			}

			// Check if target path already exists
			try {
				await vscode.workspace.fs.stat(newUri)
				// If stat succeeds, the file exists
				throw new Error(`Target path '${fileAction.newPath}' already exists.`)
			} catch (error) {
				// If stat fails with 'FileNotFound' or similar, it's good.
				// If it's the "already exists" error we threw, re-throw it.
				if (
					error instanceof Error &&
					error.message.includes('already exists')
				) {
					throw error
				}
				// Otherwise, assume file not found, which is the desired state to proceed.
			}

			// Perform the rename
			await vscode.workspace.fs.rename(fileUri, newUri, { overwrite: false })

			results.push({
				path: fileAction.path,
				action: 'rename',
				success: true,
				message: `File renamed successfully to '${fileAction.newPath}'`,
				newPath: fileAction.newPath,
			})
		} catch (error) {
			results.push({
				path: fileAction.path,
				action: 'rename',
				success: false,
				message: error instanceof Error ? error.message : String(error),
				newPath: fileAction.newPath,
			})
		}
	}
}

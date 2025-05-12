import * as vscode from 'vscode'
import path from 'node:path'
import type { FileAction } from '../../utils/xml-parser'

interface FileActionResult {
	path: string
	action: string
	success: boolean
	message: string
	newPath?: string
}

/**
 * Processes the file actions extracted from the XML.
 */
export async function applyFileActions(
	fileActions: FileAction[],
	rootPath: string,
	view?: vscode.WebviewView, // Optional: if direct webview interaction is needed from handlers
): Promise<FileActionResult[]> {
	const results: FileActionResult[] = []

	for (const fileAction of fileActions) {
		try {
			const absolutePath = path.isAbsolute(fileAction.path)
				? fileAction.path
				: path.join(rootPath, fileAction.path)
			const fileUri = vscode.Uri.file(absolutePath)

			switch (fileAction.action) {
				case 'create':
					await handleCreateAction(fileAction, fileUri, results)
					break
				case 'rewrite':
					await handleRewriteAction(fileAction, fileUri, results)
					break
				case 'modify':
					await handleModifyAction(fileAction, fileUri, results)
					break
				case 'delete':
					await handleDeleteAction(fileAction, fileUri, results)
					break
				case 'rename':
					await handleRenameAction(fileAction, fileUri, rootPath, results)
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
async function handleCreateAction(
	fileAction: FileAction,
	fileUri: vscode.Uri,
	results: FileActionResult[],
): Promise<void> {
	try {
		if (!fileAction.changes || fileAction.changes.length === 0) {
			throw new Error('No content provided for create action')
		}
		const content = fileAction.changes[0].content

		try {
			await vscode.workspace.fs.stat(fileUri)
			throw new Error('File already exists, cannot create')
		} catch (error) {
			if (
				!(
					error instanceof vscode.FileSystemError &&
					error.code === 'FileNotFound'
				)
			) {
				throw error
			}
		}

		const dirUri = vscode.Uri.file(path.dirname(fileUri.fsPath))
		try {
			await vscode.workspace.fs.stat(dirUri)
		} catch (error) {
			if (
				error instanceof vscode.FileSystemError &&
				error.code === 'FileNotFound'
			) {
				await vscode.workspace.fs.createDirectory(dirUri)
			} else {
				throw error
			}
		}

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
async function handleModifyAction(
	fileAction: FileAction,
	fileUri: vscode.Uri,
	results: FileActionResult[],
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
	const workspaceEdit = new vscode.WorkspaceEdit()

	try {
		const document = await vscode.workspace.openTextDocument(fileUri)
		const fullText = document.getText()

		for (const change of fileAction.changes) {
			try {
				if (!change.search) {
					changeResults.push('Error: Search block missing in a change')
					continue
				}

				const searchPos = fullText.indexOf(change.search)
				if (searchPos === -1) {
					changeResults.push(
						`Error: Search text not found: "${change.search.slice(0, 20)}..."`,
					)
					continue
				}

				const nextPos = fullText.indexOf(change.search, searchPos + 1)
				if (nextPos !== -1) {
					changeResults.push(
						`Error: Ambiguous search text - found multiple matches: "${change.search.slice(0, 20)}..."`,
					)
					continue
				}

				const startPos = document.positionAt(searchPos)
				const endPos = document.positionAt(searchPos + change.search.length)
				const range = new vscode.Range(startPos, endPos)
				workspaceEdit.replace(fileUri, range, change.content)

				successCount++
				changeResults.push(`Success: Applied change: "${change.description}"`)
			} catch (changeError) {
				changeResults.push(
					`Error with change: ${changeError instanceof Error ? changeError.message : String(changeError)}`,
				)
			}
		}

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
async function handleRewriteAction(
	fileAction: FileAction,
	fileUri: vscode.Uri,
	results: FileActionResult[],
): Promise<void> {
	try {
		if (!fileAction.changes || fileAction.changes.length === 0) {
			throw new Error('No content provided for rewrite action')
		}
		const content = fileAction.changes[0].content

		try {
			await vscode.workspace.fs.stat(fileUri)
		} catch (error) {
			throw new Error('File does not exist, cannot rewrite')
		}

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
async function handleDeleteAction(
	fileAction: FileAction,
	fileUri: vscode.Uri,
	results: FileActionResult[],
): Promise<void> {
	try {
		try {
			await vscode.workspace.fs.stat(fileUri)
		} catch (error) {
			throw new Error('File does not exist, cannot delete')
		}

		await vscode.workspace.fs.delete(fileUri, {
			recursive: true,
			useTrash: true,
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
async function handleRenameAction(
	fileAction: FileAction,
	fileUri: vscode.Uri,
	rootPath: string,
	results: FileActionResult[],
): Promise<void> {
	try {
		if (!fileAction.newPath) {
			throw new Error('Missing new path for rename operation.')
		}
		const newUri = vscode.Uri.joinPath(
			vscode.Uri.file(rootPath),
			fileAction.newPath,
		)

		try {
			await vscode.workspace.fs.stat(fileUri)
		} catch (error) {
			throw new Error(
				`Original file '${fileAction.path}' does not exist, cannot rename.`,
			)
		}

		try {
			await vscode.workspace.fs.stat(newUri)
			throw new Error(`Target path '${fileAction.newPath}' already exists.`)
		} catch (error) {
			if (error instanceof Error && error.message.includes('already exists')) {
				throw error
			}
		}

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

import path from 'node:path'
import * as vscode from 'vscode'
import { resolveXmlPathToUri } from '../../utils/path-resolver'
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
	// rootPath: string, // Removed rootPath parameter
	view?: vscode.WebviewView, // Optional: if direct webview interaction is needed from handlers
): Promise<FileActionResult[]> {
	const results: FileActionResult[] = []

	for (const fileAction of fileActions) {
		try {
			// Resolve XML path (supports absolute, file://, or workspace-relative with optional root)
			const fileUri = resolveXmlPathToUri(fileAction.path, fileAction.root)

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
					await handleRenameAction(fileAction, fileUri, results)
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

        // Ensure parent directory exists
        const dirUri = vscode.Uri.file(path.dirname(fileUri.fsPath))
        try {
            await vscode.workspace.fs.createDirectory(dirUri)
        } catch (e) {
            // ignore; createDirectory is idempotent
        }

        // If the file already exists, treat create as a no-op for idempotency
        try {
            await vscode.workspace.fs.stat(fileUri)
            results.push({
                path: fileAction.path,
                action: 'create',
                success: true,
                message: 'File already exists (skipped create)',
            })
            return
        } catch {
            // not exists, continue to create
        }

        const edit = new vscode.WorkspaceEdit()
        edit.createFile(fileUri, { overwrite: false, ignoreIfExists: false })
        edit.insert(fileUri, new vscode.Position(0, 0), content)
        const applied = await vscode.workspace.applyEdit(edit)

		// Save the document if it's open to avoid "unsaved" state
		if (applied) {
			await saveDocumentIfOpen(fileUri)
		}

		results.push({
			path: fileAction.path,
			action: 'create',
			success: applied,
			message: applied ? 'File created successfully' : 'Failed to create file',
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
		const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'

		for (const change of fileAction.changes) {
			try {
				if (!change.search) {
					changeResults.push('Error: Search block missing in a change')
					continue
				}

				// Normalize search block line endings to document EOL
				const normalizedSearch = normalizeToEol(change.search, eol)

				let searchPos = fullText.indexOf(normalizedSearch)
				if (searchPos === -1) {
					changeResults.push(
						`Error: Search text not found: "${normalizedSearch.slice(0, 20)}..."`,
					)
					continue
				}

				// Handle ambiguous occurrences
				const nextPos = fullText.indexOf(normalizedSearch, searchPos + 1)
				if (nextPos !== -1) {
					const occ = change.occurrence
					if (occ === 'first' || occ === undefined) {
						// keep first
					} else if (occ === 'last') {
						searchPos = fullText.lastIndexOf(normalizedSearch)
					} else if (typeof occ === 'number' && occ > 0) {
						searchPos = findNthOccurrence(fullText, normalizedSearch, occ)
						if (searchPos === -1) {
							changeResults.push(
								`Error: occurrence=${occ} not found for search block`,
							)
							continue
						}
					} else {
						changeResults.push(
							'Error: Ambiguous search text - found multiple matches; specify <occurrence>first|last|N</occurrence>',
						)
						continue
					}
				}

				const startPos = document.positionAt(searchPos)
				const endPos = document.positionAt(searchPos + normalizedSearch.length)
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

			// Save the document if it's open to avoid "unsaved" state
			await saveDocumentIfOpen(fileUri)

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

		const document = await vscode.workspace.openTextDocument(fileUri)
		const fullRange = new vscode.Range(
			new vscode.Position(0, 0),
			document.lineAt(Math.max(0, document.lineCount - 1))
				.rangeIncludingLineBreak.end,
		)
		const edit = new vscode.WorkspaceEdit()
		edit.replace(fileUri, fullRange, content)
		const applied = await vscode.workspace.applyEdit(edit)

		// Save the document if it's open to avoid "unsaved" state
		if (applied) {
			await saveDocumentIfOpen(fileUri)
		}

		results.push({
			path: fileAction.path,
			action: 'rewrite',
			success: applied,
			message: applied
				? 'File rewritten successfully'
				: 'Failed to rewrite file',
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

		const edit = new vscode.WorkspaceEdit()
		edit.deleteFile(fileUri, { recursive: true, ignoreIfNotExists: false })
		const applied = await vscode.workspace.applyEdit(edit)
		results.push({
			path: fileAction.path,
			action: 'delete',
			success: applied,
			message: applied ? 'File deleted successfully' : 'Failed to delete file',
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
	// rootPath: string, // Removed rootPath parameter
	results: FileActionResult[],
): Promise<void> {
	try {
		if (!fileAction.newPath) {
			throw new Error('Missing new path for rename operation.')
		}
		// Resolve new path relative to same workspace root if provided
		const newUri = resolveXmlPathToUri(fileAction.newPath, fileAction.root)

		try {
			await vscode.workspace.fs.stat(fileUri)
		} catch (error) {
			throw new Error(
				`Original file '${fileAction.path}' does not exist, cannot rename.`,
			)
		}

		// Ensure destination directory exists
		try {
			await vscode.workspace.fs.createDirectory(
				vscode.Uri.file(path.dirname(newUri.fsPath)),
			)
		} catch {}

		const edit = new vscode.WorkspaceEdit()
		edit.renameFile(fileUri, newUri, {
			overwrite: false,
			ignoreIfExists: false,
		})
		const applied = await vscode.workspace.applyEdit(edit)
		results.push({
			path: fileAction.path,
			action: 'rename',
			success: applied,
			message: applied
				? `File renamed successfully to '${fileAction.newPath}'`
				: `Failed to rename to '${fileAction.newPath}'`,
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

function normalizeToEol(text: string, eol: string): string {
	// Normalize any CRLF to LF first, then convert to desired EOL
	const lf = text.replace(/\r\n/g, '\n')
	return eol === '\r\n' ? lf.replace(/\n/g, '\r\n') : lf
}

function findNthOccurrence(
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
 * Attempts to save a document if it's currently open in VS Code.
 * This ensures that workspace edits are persisted to disk and the file
 * doesn't remain in an "unsaved" state in the editor.
 */
async function saveDocumentIfOpen(fileUri: vscode.Uri): Promise<void> {
	try {
		// Check if the document is currently open
		const openDoc = vscode.workspace.textDocuments.find(
			(doc) => doc.uri.toString() === fileUri.toString(),
		)

		if (openDoc?.isDirty) {
			await openDoc.save()
		}
	} catch (error) {
		// Log the error but don't throw - save failures shouldn't break the entire operation
		console.warn(`Failed to save document ${fileUri.fsPath}:`, error)
	}
}

import path from 'node:path'
import * as vscode from 'vscode'
import { telemetry } from '../../services/telemetry'
import { clearCache } from '../../services/token-counter'
import { resolveXmlPathToUri } from '../../utils/path-resolver'
import type { FileAction } from '../../utils/xml-parser'

interface FileActionResult {
	path: string
	action: string
	success: boolean
	message: string
	newPath?: string
}

type FileActionChange = NonNullable<FileAction['changes']>[number]

interface ModifyContext {
	document: vscode.TextDocument
	fullText: string
	eol: string
	fileUri: vscode.Uri
	workspaceEdit: vscode.WorkspaceEdit
}

interface ModifyChangeResult {
	success: boolean
	message: string
}

type RangeLookupResult =
	| { ok: true; range: vscode.Range }
	| { ok: false; errorMessage: string }

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
			// Track file action errors
			try {
				telemetry.trackUnhandled('backend', error)
			} catch (e) {
				console.warn('[telemetry] failed to track file action error', e)
			}

			results.push({
				path: fileAction.path,
				action: fileAction.action,
				success: false,
				message: error instanceof Error ? error.message : String(error),
			})
		}
	}

	// Clear token cache sau khi apply xong
	clearCache()

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
		} catch (dirError) {
			// Check if it's a permission error
			const msg =
				dirError instanceof Error ? dirError.message : String(dirError)
			if (msg.includes('EACCES') || msg.includes('permission')) {
				throw new Error(
					`Permission denied: Cannot create directory ${dirUri.fsPath}`,
				)
			}
			// createDirectory is idempotent - directory may already exist
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
		const errorMsg = error instanceof Error ? error.message : String(error)
		let friendlyMessage = errorMsg

		// Provide user-friendly error messages for common issues
		if (errorMsg.includes('ENOSPC') || errorMsg.includes('no space')) {
			friendlyMessage = 'Disk full: Not enough space to create file'
		} else if (errorMsg.includes('EACCES') || errorMsg.includes('permission')) {
			friendlyMessage = 'Permission denied: Cannot write to this location'
		} else if (errorMsg.includes('EBUSY') || errorMsg.includes('locked')) {
			friendlyMessage = 'File is locked by another process'
		} else if (errorMsg.includes('EROFS') || errorMsg.includes('read-only')) {
			friendlyMessage = 'Read-only file system: Cannot create file'
		}

		results.push({
			path: fileAction.path,
			action: 'create',
			success: false,
			message: friendlyMessage,
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
	const { changes } = fileAction
	if (!changes || changes.length === 0) {
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
		const context: ModifyContext = {
			document,
			fullText: document.getText(),
			eol: document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n',
			fileUri,
			workspaceEdit,
		}

		const modifyResult = applyModifyChanges(changes, context)
		successCount = modifyResult.successCount
		changeResults.push(...modifyResult.changeResults)

		if (successCount > 0) {
			await vscode.workspace.applyEdit(workspaceEdit)

			// Save the document if it's open to avoid "unsaved" state
			await saveDocumentIfOpen(fileUri)

			results.push({
				path: fileAction.path,
				action: 'modify',
				success: true,
				message: `Applied ${successCount}/${
					changes.length
				} modifications. ${changeResults.join('; ')}`,
			})
		} else {
			results.push({
				path: fileAction.path,
				action: 'modify',
				success: false,
				message: `Failed to apply any modifications. ${changeResults.join(
					'; ',
				)}`,
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

function applyModifyChanges(
	changes: NonNullable<FileAction['changes']>,
	context: ModifyContext,
): { successCount: number; changeResults: string[] } {
	let successCount = 0
	const changeResults: string[] = []

	for (const change of changes) {
		try {
			const result = applyModifyChange(change, context)
			if (result.success) {
				successCount++
			}
			changeResults.push(result.message)
		} catch (error) {
			changeResults.push(
				`Error with change: ${
					error instanceof Error ? error.message : String(error)
				}`,
			)
		}
	}

	return { successCount, changeResults }
}

function applyModifyChange(
	change: FileActionChange,
	context: ModifyContext,
): ModifyChangeResult {
	if (!change.search) {
		return {
			success: false,
			message: 'Error: Search block missing in a change',
		}
	}

	const normalizedSearch = normalizeToEol(change.search, context.eol)
	const rangeResult = findChangeRange(
		context,
		normalizedSearch,
		change.occurrence,
	)

	if (!rangeResult.ok) {
		return {
			success: false,
			message: rangeResult.errorMessage,
		}
	}

	context.workspaceEdit.replace(
		context.fileUri,
		rangeResult.range,
		change.content,
	)
	return {
		success: true,
		message: `Success: Applied change: "${change.description}"`,
	}
}

function findChangeRange(
	context: ModifyContext,
	normalizedSearch: string,
	occurrence: FileActionChange['occurrence'],
): RangeLookupResult {
	const { position, errorMessage } = resolveSearchPosition(
		context.fullText,
		normalizedSearch,
		occurrence,
	)

	if (position === null || position === undefined) {
		return errorMessage
			? { ok: false, errorMessage }
			: { ok: false, errorMessage: getSearchNotFoundMessage(normalizedSearch) }
	}

	const startPos = context.document.positionAt(position)
	const endPos = context.document.positionAt(position + normalizedSearch.length)
	return { ok: true, range: new vscode.Range(startPos, endPos) }
}

function resolveSearchPosition(
	fullText: string,
	normalizedSearch: string,
	occurrence: FileActionChange['occurrence'],
): { position: number | null; errorMessage?: string } {
	const firstPos = fullText.indexOf(normalizedSearch)
	if (firstPos === -1) {
		return {
			position: null,
			errorMessage: getSearchNotFoundMessage(normalizedSearch),
		}
	}

	const hasMultiple = fullText.includes(normalizedSearch, firstPos + 1)

	if (!hasMultiple || occurrence === 'first' || occurrence === undefined) {
		return { position: firstPos }
	}

	if (occurrence === 'last') {
		return { position: fullText.lastIndexOf(normalizedSearch) }
	}

	if (
		typeof occurrence === 'number' &&
		Number.isFinite(occurrence) &&
		occurrence > 0
	) {
		const nthPos = findNthOccurrence(fullText, normalizedSearch, occurrence)
		if (nthPos === -1) {
			return {
				position: null,
				errorMessage: `Error: occurrence=${occurrence} not found for search block`,
			}
		}
		return { position: nthPos }
	}

	return {
		position: null,
		errorMessage:
			'Error: Ambiguous search text - found multiple matches; specify <occurrence>first|last|N</occurrence>',
	}
}

function getSearchNotFoundMessage(search: string): string {
	return `Error: Search text not found: "${search.slice(0, 20)}..."`
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

		await ensureFileExists(fileUri, 'File does not exist, cannot rewrite')

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
		await ensureFileExists(fileUri, 'File does not exist, cannot delete')

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

		await ensureFileExists(
			fileUri,
			`Original file '${fileAction.path}' does not exist, cannot rename.`,
		)

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

async function ensureFileExists(
	fileUri: vscode.Uri,
	errorMessage: string,
): Promise<void> {
	try {
		await vscode.workspace.fs.stat(fileUri)
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error)
		const suffix = reason ? ` (${reason})` : ''
		throw new Error(`${errorMessage}${suffix}`)
	}
}

function normalizeToEol(text: string, eol: string): string {
	// Normalize any CRLF to LF first, then convert to desired EOL
	const lf = text.split('\r\n').join('\n')
	return eol === '\r\n' ? lf.split('\n').join('\r\n') : lf
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

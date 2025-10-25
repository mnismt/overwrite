import * as vscode from 'vscode'
import type { FileAction } from '../utils/xml-parser'

export interface ChangeSummary {
	added: number
	removed: number
}

export interface PreviewTableRow {
	path: string
	action: 'create' | 'rewrite' | 'modify' | 'delete' | 'rename'
	description: string
	changes: ChangeSummary
	newPath?: string
	hasError?: boolean
	errorMessage?: string
	changeBlocks?: Array<{
		description: string
		search?: string
		content: string
	}>
}

export interface PreviewData {
	rows: PreviewTableRow[]
	errors: string[]
}

export async function analyzeFileActions(
	fileActions: FileAction[],
): Promise<PreviewData> {
	const rows: PreviewTableRow[] = []
	const errors: string[] = []

	for (const fileAction of fileActions) {
		try {
			const row = await analyzeFileAction(fileAction)
			rows.push(row)
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error)
			errors.push(`Error analyzing ${fileAction.path}: ${errorMessage}`)
		}
	}

	return { rows, errors }
}

async function analyzeFileAction(
	fileAction: FileAction,
): Promise<PreviewTableRow> {
	let hasError = false
	let errorMessage: string | undefined

	try {
		const changes = await calculateChangeSummary(fileAction)
		const description = generateDescription(fileAction)

		return {
			path: fileAction.path,
			action: fileAction.action,
			description,
			changes,
			newPath: fileAction.newPath,
			hasError,
			errorMessage,
			// Include full change blocks for error context reporting
			changeBlocks: fileAction.changes?.map((c) => ({
				description: c.description,
				search: c.search,
				content: c.content,
			})),
		}
	} catch (error) {
		hasError = true
		errorMessage = error instanceof Error ? error.message : String(error)

		return {
			path: fileAction.path,
			action: fileAction.action,
			description: `Error: ${errorMessage}`,
			changes: { added: 0, removed: 0 },
			newPath: fileAction.newPath,
			hasError,
			errorMessage,
			changeBlocks: [],
		}
	}
}

async function calculateChangeSummary(
	fileAction: FileAction,
): Promise<ChangeSummary> {
	switch (fileAction.action) {
		case 'create':
			return calculateCreateChanges(fileAction)
		case 'rewrite':
			return calculateRewriteChanges(fileAction)
		case 'modify':
			return calculateModifyChanges(fileAction)
		case 'delete':
			return calculateDeleteChanges(fileAction)
		case 'rename':
			return { added: 0, removed: 0 }
		default:
			return { added: 0, removed: 0 }
	}
}

function calculateCreateChanges(fileAction: FileAction): ChangeSummary {
	let added = 0
	if (fileAction.changes && fileAction.changes.length > 0) {
		for (const change of fileAction.changes) {
			added += countLines(change.content)
		}
	}
	return { added, removed: 0 }
}

async function calculateRewriteChanges(
	fileAction: FileAction,
): Promise<ChangeSummary> {
	let added = 0
	let removed = 0

	if (fileAction.changes && fileAction.changes.length > 0) {
		for (const change of fileAction.changes) {
			added += countLines(change.content)
		}
	}

	try {
		const targetUri = resolvePathToUri(fileAction.path, fileAction.root)
		const doc = await vscode.workspace.openTextDocument(targetUri)
		removed = doc.lineCount
	} catch {
		// File doesn't exist, treat as create
	}

	return { added, removed }
}

function calculateModifyChanges(fileAction: FileAction): ChangeSummary {
	let added = 0
	let removed = 0

	if (fileAction.changes) {
		for (const change of fileAction.changes) {
			const searchLines = change.search ? countLines(change.search) : 1
			const contentLines = countLines(change.content)
			removed += searchLines
			added += contentLines
		}
	}

	return { added, removed }
}

async function calculateDeleteChanges(
	fileAction: FileAction,
): Promise<ChangeSummary> {
	try {
		const targetUri = resolvePathToUri(fileAction.path, fileAction.root)
		const doc = await vscode.workspace.openTextDocument(targetUri)
		return { added: 0, removed: doc.lineCount }
	} catch {
		// File doesn't exist, assume 50 lines for estimation
		return { added: 0, removed: 50 }
	}
}

function generateDescription(fileAction: FileAction): string {
	switch (fileAction.action) {
		case 'create':
			return fileAction.changes?.[0]?.description || 'Create file'
		case 'rewrite':
			return fileAction.changes?.[0]?.description || 'Rewrite file'
		case 'delete':
			return 'Delete file'
		case 'rename':
			return `Rename to ${fileAction.newPath || 'new location'}`
		case 'modify': {
			if (!fileAction.changes || fileAction.changes.length === 0) {
				return 'Modify file'
			}

			if (fileAction.changes.length === 1) {
				return fileAction.changes[0].description
			}

			if (fileAction.changes.length <= 3) {
				return fileAction.changes.map((c) => c.description).join(' • ')
			}

			const firstTwo = fileAction.changes
				.slice(0, 2)
				.map((c) => c.description)
				.join(' • ')
			const remaining = fileAction.changes.length - 2
			return `${firstTwo} • (+${remaining} more)`
		}
		default:
			return 'Unknown action'
	}
}

function countLines(text: string): number {
	if (!text) return 0
	return text.split('\n').length
}

function resolvePathToUri(p: string, root?: string): vscode.Uri {
	try {
		// Try to use the existing path resolver
		const { resolveXmlPathToUri } = require('../utils/path-resolver')
		return resolveXmlPathToUri(p, root)
	} catch {
		// Fallback: try to resolve as workspace-relative or absolute
		const path = require('node:path')
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

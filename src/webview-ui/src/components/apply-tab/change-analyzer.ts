import type { ChangeSummary, PreviewTableRow } from './types'

interface ChangeBlock {
	description: string
	search?: string
	content: string
}

interface FileAction {
	path: string
	action: 'create' | 'rewrite' | 'modify' | 'delete' | 'rename'
	newPath?: string
	changes?: ChangeBlock[]
}

export function analyzeFileAction(fileAction: FileAction): PreviewTableRow {
	const changes = calculateChangeSummary(fileAction)
	const description = generateDescription(fileAction)

	return {
		path: fileAction.path,
		action: fileAction.action,
		description,
		changes,
		newPath: fileAction.newPath,
		changeBlocks: fileAction.changes,
	}
}

function calculateChangeSummary(fileAction: FileAction): ChangeSummary {
	let added = 0
	let removed = 0

	switch (fileAction.action) {
		case 'create':
		case 'rewrite': {
			if (fileAction.changes && fileAction.changes.length > 0) {
				for (const change of fileAction.changes) {
					added += countLines(change.content)
				}
			}
			if (fileAction.action === 'rewrite') {
				removed = Math.ceil(added * 0.8)
			}
			break
		}
		case 'modify': {
			if (fileAction.changes) {
				for (const change of fileAction.changes) {
					const searchLines = change.search ? countLines(change.search) : 1
					const contentLines = countLines(change.content)

					removed += searchLines
					added += contentLines
				}
			}
			break
		}
		case 'delete': {
			removed = 50
			break
		}
		case 'rename': {
			break
		}
	}

	return { added, removed }
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

export function analyzeFileActions(
	fileActions: FileAction[],
): PreviewTableRow[] {
	return fileActions.map(analyzeFileAction)
}

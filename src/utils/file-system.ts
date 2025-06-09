import * as path from 'node:path' // Still needed for path.relative and path.join for ignore patterns
import ignore from 'ignore'
import * as vscode from 'vscode'
import type { VscodeTreeItem } from '../types'

// Define icons for files and folders (can be customized further)
const FOLDER_ICONS = {
	branch: 'folder', // Codicon for closed folder
	leaf: 'file', // Codicon for file
	open: 'folder-opened', // Codicon for opened folder
}

const FILE_ICONS = {
	branch: 'file', // Placeholder, not typically used for files by tree components
	leaf: 'file', // Codicon for file
	open: 'file', // Placeholder, not typically used for files by tree components
}

/**
 * Recursively reads a directory using vscode.workspace.fs and builds a tree structure.
 * @param currentUri The URI of the directory to read.
 * @param rootUri The URI of the workspace root for this directory (for .gitignore path relativity).
 * @param excludedDirs An array of additional directory patterns to exclude (like .gitignore patterns).
 * @param ign The ignore object from the 'ignore' package for .gitignore rules.
 * @param userIgnore The ignore object from the 'ignore' package for user-defined excluded patterns.
 * @returns A promise that resolves to an array of VscodeTreeItem objects.
 */
async function readDirectoryRecursiveForRoot(
	currentUri: vscode.Uri,
	rootUri: vscode.Uri,
	excludedDirs: string[],
	ign: ignore.Ignore,
	userIgnore: ignore.Ignore,
): Promise<VscodeTreeItem[]> {
	const items: VscodeTreeItem[] = []

	try {
		const entries = await vscode.workspace.fs.readDirectory(currentUri)

		// Sort entries: directories first, then alphabetically by name
		const sortedEntries = entries.sort((a, b) => {
			if (
				a[1] === vscode.FileType.Directory &&
				b[1] !== vscode.FileType.Directory
			)
				return -1
			if (
				a[1] !== vscode.FileType.Directory &&
				b[1] === vscode.FileType.Directory
			)
				return 1
			return a[0].localeCompare(b[0])
		})

		for (const [name, type] of sortedEntries) {
			const entryUri = vscode.Uri.joinPath(currentUri, name)
			const relativePathForIgnore = path.relative(
				rootUri.fsPath,
				entryUri.fsPath,
			)

			// Check .gitignore
			if (ign.ignores(relativePathForIgnore)) {
				continue
			}

			// Check user-defined excluded patterns
			if (userIgnore.ignores(relativePathForIgnore)) {
				continue
			}

			const item: VscodeTreeItem = {
				label: name,
				value: entryUri.toString(), // Use full URI string as the value
				// icons: type === vscode.FileType.Directory ? FOLDER_ICONS : { leaf: 'file' }, // Simplified, vscode-tree might handle this
			}

			if (type === vscode.FileType.Directory) {
				item.icons = FOLDER_ICONS // Apply folder icons
				const subItems = await readDirectoryRecursiveForRoot(
					entryUri,
					rootUri,
					excludedDirs,
					ign,
					userIgnore,
				)
				if (subItems.length > 0) {
					item.subItems = subItems
				}
			} else if (type === vscode.FileType.File) {
				item.icons = FILE_ICONS // Apply file icon
			}
			// Symlinks and Unknown types are currently ignored but could be handled

			items.push(item)
		}
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		console.error(
			`Error reading directory ${currentUri.fsPath}: ${errorMessage}`,
		)
		// Optionally, inform the user if a specific directory is unreadable
		// vscode.window.showWarningMessage(`Could not read directory: ${currentUri.fsPath}`);
	}

	return items
}

/**
 * Gets the file tree structure for all workspace folders, respecting .gitignore for each.
 * @param excludedDirs An array of additional directory names to exclude globally.
 * @returns A promise that resolves to an array of VscodeTreeItem objects, where each top-level item is a workspace root.
 */
export async function getWorkspaceFileTree(
	excludedDirs: string[],
): Promise<VscodeTreeItem[]> {
	const workspaceFolders = vscode.workspace.workspaceFolders
	if (!workspaceFolders || workspaceFolders.length === 0) {
		vscode.window.showInformationMessage('No workspace folder open.')
		return []
	}

	const allRootItems: VscodeTreeItem[] = []

	for (const folder of workspaceFolders) {
		const rootUri = folder.uri
		const rootFsPath = rootUri.fsPath
		const gitignorePath = path.join(rootFsPath, '.gitignore')

		let ign = ignore() // Default empty ignore for this root
		try {
			const gitignoreContentBytes = await vscode.workspace.fs.readFile(
				vscode.Uri.file(gitignorePath),
			)
			const gitignoreContent = Buffer.from(gitignoreContentBytes).toString(
				'utf8',
			)
			ign = ignore().add(gitignoreContent.split(/\r?\n/)) // Handle both LF and CRLF
		} catch (error) {
			// If .gitignore doesn't exist or is unreadable, proceed without it for this root
			console.warn(
				`No .gitignore found or readable in ${rootFsPath}, proceeding without gitignore rules for this root.`,
			)
		}

		// Add common VS Code/Node specific ignores by default if not covered by project's .gitignore
		// These are often in global .gitignore but good to have fallbacks.
		// Example: ign.add(['.vscode', 'node_modules', '.git'])
		// For now, we rely on the project's .gitignore primarily.

		// Create ignore object for user-defined excluded patterns
		const userIgnore = ignore().add(excludedDirs)

		const subItems = await readDirectoryRecursiveForRoot(
			rootUri,
			rootUri, // rootUri itself is the base for relative ignore paths
			excludedDirs,
			ign,
			userIgnore,
		)

		const rootItem: VscodeTreeItem = {
			label: folder.name, // Use workspace folder name as label
			value: rootUri.toString(), // Use root URI string as value
			icons: FOLDER_ICONS, // Root is a folder
			subItems: subItems,
			// Optionally, mark as open by default
			// open: true,
		}
		allRootItems.push(rootItem)
	}

	return allRootItems
}

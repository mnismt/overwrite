import * as vscode from 'vscode'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import ignore from 'ignore' // Import the ignore package
import type { VscodeTreeItem } from '../types'

/**
 * Recursively reads a directory and builds a tree structure suitable for vscode-tree, excluding files based on .gitignore.
 * @param dirPath The absolute path of the directory to read.
 * @param rootPath The absolute path of the workspace root.
 * @param excludedDirs An array of additional directories to exclude.
 * @param ign The ignore object from the 'ignore' package.
 * @returns A promise that resolves to an array of VscodeTreeItem objects.
 */
async function readDirectoryRecursive(
	dirPath: string,
	rootPath: string,
	excludedDirs: string[],
	ign: ignore.Ignore,
): Promise<VscodeTreeItem[]> {
	const items: VscodeTreeItem[] = []

	// Define icons for files and folders
	const icons = {
		branch: 'folder', // Closed folder icon
		leaf: 'file', // File icon
		open: 'folder-opened', // Opened folder icon
	}

	try {
		const entries = await fs.readdir(dirPath, { withFileTypes: true })
		const relativeDirPath = path.relative(rootPath, dirPath)
		// Filter entries based on .gitignore patterns
		const filteredEntries = entries.filter((entry) => {
			const relativeEntryPath = path.join(relativeDirPath, entry.name)
			return !ign.ignores(relativeEntryPath)
		})

		// Sort entries: directories first, then alphabetically
		const sortedEntries = filteredEntries.sort((a, b) => {
			if (a.isDirectory() && !b.isDirectory()) return -1
			if (!a.isDirectory() && b.isDirectory()) return 1
			return a.name.localeCompare(b.name)
		})

		for (const entry of sortedEntries) {
			const fullPath = path.join(dirPath, entry.name)
			const relativePath = path.join(relativeDirPath, entry.name)

			// Additional check for excluded directories
			const isExcluded = excludedDirs.some((excludedDir) => {
				return (
					entry.name === excludedDir ||
					relativePath.startsWith(excludedDir + path.sep)
				)
			})

			if (isExcluded) {
				continue
			}

			const item: VscodeTreeItem = {
				label: entry.name,
				value: relativePath,
			}

			if (entry.isDirectory()) {
				const subItems = await readDirectoryRecursive(
					fullPath,
					rootPath,
					excludedDirs,
					ign,
				)
				if (subItems.length > 0) {
					item.subItems = subItems
				}
			}

			items.push(item)
		}
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		console.error(`Error reading directory ${dirPath}: ${errorMessage}`)
		// Avoid showing an error message for every unreadable directory, might be noisy
		// vscode.window.showErrorMessage(`Error reading directory ${dirPath}: ${errorMessage}`);
	}

	return items
}

/**
 * Gets the file tree structure for the current workspace, respecting .gitignore.
 * @param excludedDirs An array of additional directories to exclude.
 * @returns A promise that resolves to an array of VscodeTreeItem objects.
 */
export async function getWorkspaceFileTree(
	excludedDirs: string[],
): Promise<VscodeTreeItem[]> {
	const workspaceFolders = vscode.workspace.workspaceFolders
	if (!workspaceFolders || workspaceFolders.length === 0) {
		vscode.window.showInformationMessage('No workspace folder open.')
		return []
	}
	const rootPath = workspaceFolders[0].uri.fsPath
	const gitignorePath = path.join(rootPath, '.gitignore')

	let ign = ignore().add([]) // Default empty ignore
	try {
		const gitignoreContent = await fs.readFile(gitignorePath, 'utf8')
		ign = ignore().add(gitignoreContent.split('\n'))
	} catch (error) {
		// If .gitignore doesn't exist, proceed without it
		console.warn('No .gitignore found, proceeding without exclusions.')
	}

	return readDirectoryRecursive(rootPath, rootPath, excludedDirs, ign)
}

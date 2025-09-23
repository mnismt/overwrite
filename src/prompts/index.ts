import * as path from 'node:path' // Still needed for path.relative for file map display logic
import * as vscode from 'vscode' // For vscode.workspace.fs and vscode.Uri
import type { VscodeTreeItem } from '../types'
import { isBinaryFile } from '../utils/file-system'
import { XML_FORMATTING_INSTRUCTIONS } from './xml-instruction'

// Helper function moved to module scope
function hasSelectedDescendant(
	item: VscodeTreeItem,
	selectedUris: Set<string>,
): boolean {
	if (selectedUris.has(item.value)) return true // item.value is a URI string
	if (item.subItems) {
		for (const subItem of item.subItems) {
			if (hasSelectedDescendant(subItem, selectedUris)) return true
		}
	}
	return false
}

function filterSelectedTree(
	items: VscodeTreeItem[],
	selectedUris: Set<string>, // Changed from selectedPaths to selectedUris
): VscodeTreeItem[] {
	const filterItems = (currentItems: VscodeTreeItem[]): VscodeTreeItem[] => {
		return currentItems
			.filter((item) => {
				const isSelected = selectedUris.has(item.value) // item.value is a URI string
				const hasSelectedSubItems =
					item.subItems?.some((subItem) =>
						hasSelectedDescendant(subItem, selectedUris),
					) || false
				return isSelected || hasSelectedSubItems
			})
			.map((item) => ({
				...item,
				subItems: item.subItems ? filterItems(item.subItems) : undefined,
			}))
	}

	return filterItems(items)
}

// --- Exported Functions ---

/**
 * Generates the hierarchical file map string for selected items across multiple workspace roots.
 * @param fullTreeRoots - An array of VscodeTreeItem, where each item is a root of a workspace folder.
 *                        The `value` of these root items and their children is their full URI string.
 * @param selectedUris - A set of selected URI strings.
 * @returns The formatted file map string.
 */
export function generateFileMap(
	fullTreeRoots: VscodeTreeItem[],
	selectedUris: Set<string>,
): string {
	const lines: string[] = []

	for (const rootTreeItem of fullTreeRoots) {
		// Check if this root or any of its descendants are selected
		const isRootSelectedOrHasSelectedDescendants =
			selectedUris.has(rootTreeItem.value) ||
			rootTreeItem.subItems?.some(
				(
					subItem, // Applied optional chaining
				) => hasSelectedDescendant(subItem, selectedUris),
			)

		if (isRootSelectedOrHasSelectedDescendants) {
			const rootUri = vscode.Uri.parse(rootTreeItem.value)
			lines.push(rootUri.fsPath) // Add the root's fsPath as a top-level entry

			// Filter only the children of the current root
			// If the root itself is selected, all its children that are not explicitly unselected by not being in selectedUris
			// (though filterSelectedTree handles this by inclusion) should be part of the map.
			// If the root is not selected, but descendants are, filterSelectedTree will pick them up.
			const childrenToDisplay = rootTreeItem.subItems
				? filterSelectedTree(rootTreeItem.subItems, selectedUris)
				: []

			// Only build tree string if there are children to display for this root
			if (childrenToDisplay.length > 0) {
				buildTreeString(childrenToDisplay, '', lines) // Initial prefix is empty for children of a root
			} else if (
				selectedUris.has(rootTreeItem.value) &&
				(!rootTreeItem.subItems || rootTreeItem.subItems.length === 0)
			) {
				// This case handles if a root folder itself is selected and it's empty or all its children are filtered out
				// The root path itself is already added. No further sub-tree needed.
			}
			lines.push('') // Add a blank line between root sections for readability, if desired
		}
	}
	if (lines.length > 0 && lines[lines.length - 1] === '') {
		lines.pop() // Remove trailing blank line
	}
	return lines.join('\n')
}

function buildTreeString(
	items: VscodeTreeItem[],
	prefix: string,
	lines: string[],
): void {
	for (let i = 0; i < items.length; i++) {
		const item = items[i]
		const isLast = i === items.length - 1
		const connector = isLast ? '└── ' : '├── '
		lines.push(prefix + connector + item.label)
		if (item.subItems && item.subItems.length > 0) {
			const newPrefix = prefix + (isLast ? '    ' : '│   ')
			buildTreeString(item.subItems, newPrefix, lines)
		}
	}
}

/**
 * Generates the file contents string for selected files.
 * @param selectedUris - A set of selected URI strings.
 * @returns The formatted file contents string.
 */
export async function generateFileContents(
	selectedUris: Set<string>,
): Promise<string> {
	let contentsStr = ''
	// Sort URI strings for consistent order. fsPath might be better for sorting if paths are complex.
	const sortedUriStrings = Array.from(selectedUris).sort()

	for (const uriString of sortedUriStrings) {
		const fileUri = vscode.Uri.parse(uriString)
		try {
			// Ensure it's a file using vscode.workspace.fs.stat
			const stat = await vscode.workspace.fs.stat(fileUri)
			if (stat.type === vscode.FileType.File) {
				// Check if the file is binary and skip it
				const isBinary = await isBinaryFile(fileUri)
				if (isBinary) {
					console.log('Skipping binary file:', fileUri.fsPath)
					contentsStr += `File: ${fileUri.fsPath}\n*** Skipped: Binary file ***\n\n`
					continue
				}

				const contentBuffer = await vscode.workspace.fs.readFile(fileUri)
				const content = Buffer.from(contentBuffer).toString('utf8')
				// Use full fsPath in the header as per user's example
				contentsStr += `File: ${fileUri.fsPath}\n\`\`\`\n${content}\n\`\`\`\n\n`
			} else {
				// This case should ideally not happen if only files are in selectedUris for contents
				console.log('Not a file (possibly a directory):', fileUri.fsPath)
			}
		} catch (error: unknown) {
			let errorMessage = 'Unknown error'
			if (error instanceof Error) {
				errorMessage = error.message
			} else if (typeof error === 'string') {
				errorMessage = error
			}
			console.warn(
				`Could not read file ${fileUri.fsPath} for context: ${errorMessage}`,
			)
			// Add a note about the missing/unreadable file in the context
			contentsStr += `File: ${fileUri.fsPath}\n*** Error reading file: ${errorMessage} ***\n\n`
		}
	}

	// Trim the trailing newlines
	return contentsStr.trim()
}

/**
 * Generates the complete prompt string.
 * @param fileMap - The generated file map string.
 * @param fileContents - The generated file contents string.
 * @param userInstructions - The user-provided instructions.
 * @param includeXmlFormatting - Whether to include the XML formatting instructions.
 * @returns The complete prompt string.
 */
export function generatePrompt(
	fileMap: string,
	fileContents: string,
	userInstructions: string,
	includeXmlFormatting: boolean,
): string {
	let prompt = `<file_map>
${fileMap}
</file_map>

<file_contents>
${fileContents}
</file_contents>
`
	if (includeXmlFormatting) {
		prompt += `\n${XML_FORMATTING_INSTRUCTIONS}`
	}

	if (userInstructions && userInstructions.trim() !== '') {
		prompt += `\n<user_instructions>\n${userInstructions.trim()}\n</user_instructions>\n`
	}

	return prompt
}

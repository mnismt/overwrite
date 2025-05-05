import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { VscodeTreeItem } from '../types' // Corrected import path
import { XML_FORMATTING_INSTRUCTIONS } from './xml-instruction'

function filterSelectedTree(
	items: VscodeTreeItem[],
	selectedPaths: Set<string>,
): VscodeTreeItem[] {
	function hasSelectedDescendant(
		item: VscodeTreeItem,
		selectedPaths: Set<string>,
	): boolean {
		if (selectedPaths.has(item.value)) return true
		if (item.subItems) {
			for (const subItem of item.subItems) {
				if (hasSelectedDescendant(subItem, selectedPaths)) return true
			}
		}
		return false
	}

	const filterItems = (items: VscodeTreeItem[]): VscodeTreeItem[] => {
		return items
			.filter((item) => {
				const isSelected = selectedPaths.has(item.value)
				const hasSelectedSubItems =
					item.subItems?.some((subItem) =>
						hasSelectedDescendant(subItem, selectedPaths),
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
 * Generates the hierarchical file map string for selected items.
 * @param fullTree - The complete file tree structure.
 * @param selectedPaths - A set of selected relative paths.
 * @param rootPath - The absolute path to the workspace root.
 * @returns The formatted file map string.
 */
export function generateFileMap(
	fullTree: VscodeTreeItem[],
	selectedPaths: Set<string>,
	rootPath: string,
): string {
	const selectedTree = filterSelectedTree(fullTree, selectedPaths)
	const lines: string[] = []
	lines.push(rootPath) // Start with the absolute root path
	buildTreeString(selectedTree, '', lines)
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
 * @param selectedPaths - A set of selected relative paths.
 * @param rootPath - The absolute path to the workspace root.
 * @returns The formatted file contents string.
 */
export async function generateFileContents(
	selectedPaths: Set<string>,
	rootPath: string,
): Promise<string> {
	let contentsStr = ''
	const sortedPaths = Array.from(selectedPaths).sort() // Ensure consistent order

	for (const relativePath of sortedPaths) {
		const absolutePath = path.join(rootPath, relativePath)

		try {
			const stat = await fs.stat(absolutePath)
			if (stat.isFile()) {
				const content = await fs.readFile(absolutePath, 'utf-8')
				// Use relative path in the header
				contentsStr += `File: ${relativePath}\n\`\`\`\n${content}\n\`\`\`\n\n`
			} else {
				console.log('Not a file (possibly a directory):', relativePath)
			}
		} catch (error: unknown) {
			let errorMessage = 'Unknown error'
			if (error instanceof Error) {
				errorMessage = error.message
			} else if (typeof error === 'string') {
				errorMessage = error
			}
			console.warn(
				`Could not read file ${relativePath} for context: ${errorMessage}`,
			)
			// Add a note about the missing/unreadable file in the context
			contentsStr += `File: ${relativePath}\n*** Error reading file: ${errorMessage} ***\n\n`
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

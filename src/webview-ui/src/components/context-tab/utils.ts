import { Tiktoken } from 'js-tiktoken/lite'
import o200k_base from 'js-tiktoken/ranks/o200k_base'
import type { VscodeTreeItem } from '../../../../types'

// Initialize tokenizer once
const enc = new Tiktoken(o200k_base)

// Count tokens in a string
export function countTokens(text: string): number {
	if (!text) return 0
	return enc.encode(text).length
}

// Format token count in 'k' units for display
export function formatTokenCount(count: number): string {
	return `${(count / 1000).toFixed(1)}k`
}

// Helper function to recursively gather all descendant paths
export const getAllDescendantPaths = (item: VscodeTreeItem): string[] => {
	const paths = [item.value]
	if (item.subItems) {
		for (const sub of item.subItems) {
			paths.push(...getAllDescendantPaths(sub))
		}
	}
	return paths
}

// Helper function to add decorations based on selection state
export const addDecorationsToTree = (
	items: VscodeTreeItem[],
	selectedUris: Set<string>, // Renamed from selectedPaths
): VscodeTreeItem[] => {
	return items.map((item) => {
		const decoratedItem = { ...item }

		if (decoratedItem.subItems && decoratedItem.subItems.length > 0) {
			// First, process children
			decoratedItem.subItems = addDecorationsToTree(
				decoratedItem.subItems,
				selectedUris, // Pass selectedUris
			)

			// Then calculate decoration for the parent
			const allDescendants = getAllDescendantPaths(decoratedItem) // Returns URI strings
			// Exclude the item itself when checking children status
			const descendantUris = allDescendants.filter(
				(uri) => uri !== decoratedItem.value,
			)
			const selectedDescendantsCount = descendantUris.filter(
				(uri) => selectedUris.has(uri), // Use selectedUris
			).length

			// Clear existing decorations before potentially adding new ones
			decoratedItem.decorations = undefined

			if (
				selectedDescendantsCount === descendantUris.length &&
				descendantUris.length > 0
			) {
				// If all children are selected, mark parent as Fully selected ('F')
				// Only mark if the parent itself is also selected implicitly or explicitly
				if (selectedUris.has(decoratedItem.value)) {
					// Use selectedUris
					decoratedItem.decorations = [
						{ content: 'F', color: 'var(--vscode-testing-iconPassed)' }, // Green
					]
				} else {
					// If children are full but parent isn't selected, mark as Half ('H')
					// This might happen if parent was deselected but children remained
					decoratedItem.decorations = [
						{ content: 'H', color: 'var(--vscode-testing-iconQueued)' }, // Yellow
					]
				}
			} else if (selectedDescendantsCount > 0) {
				// If some children are selected, mark as Half selected ('H')
				decoratedItem.decorations = [
					{ content: 'H', color: 'var(--vscode-testing-iconQueued)' }, // Yellow
				]
			} else if (selectedUris.has(decoratedItem.value)) {
				// Use selectedUris
				// If no children are selected, but the item itself is, mark as Fully selected ('F')
				// This applies to selected files or empty selected folders
				decoratedItem.decorations = [
					{ content: 'F', color: 'var(--vscode-testing-iconPassed)' }, // Green
				]
			}
		} else {
			// Leaf nodes (files): Mark 'F' if selected
			decoratedItem.decorations = selectedUris.has(decoratedItem.value) // Use selectedUris
				? [{ content: 'F', color: 'var(--vscode-testing-iconPassed)' }] // Green
				: undefined
		}

		return decoratedItem
	})
}

// Helper function to filter tree items based on a search query, keeping ancestors of matched items
export const filterTreeData = (
	items: VscodeTreeItem[],
	query: string,
): VscodeTreeItem[] => {
	if (!query) return items
	const lowerQuery = query.toLowerCase()
	return items.reduce((acc: VscodeTreeItem[], item) => {
		const label = item.label || ''
		const labelMatches = label.toLowerCase().includes(lowerQuery)
		let filteredSubs: VscodeTreeItem[] | undefined
		if (item.subItems && item.subItems.length > 0) {
			filteredSubs = filterTreeData(item.subItems, query)
		}
		if (labelMatches) {
			// If label matches, include entire subtree
			acc.push(item)
		} else if (filteredSubs && filteredSubs.length > 0) {
			// If any descendants match, include item with filtered children
			acc.push({ ...item, subItems: filteredSubs })
		}
		return acc
	}, [])
}

// Helper function to recursively add actions to tree data
export const addActionsToTree = (
	items: VscodeTreeItem[],
	selectedUris: Set<string>, // Renamed from selectedPaths
): VscodeTreeItem[] => {
	return items.map((item) => {
		const isSelected = selectedUris.has(item.value) // Use selectedUris
		const selectAction = {
			icon: isSelected ? 'close' : 'add',
			actionId: 'toggle-select',
			tooltip: isSelected ? 'Deselect' : 'Select',
		}

		const newItem: VscodeTreeItem = {
			...item,
			selected: false, // Let decoration/action icon show state
			actions: [selectAction],
			// Ensure icons are defined if not provided
			icons: item.icons ?? {
				branch: 'folder',
				open: 'folder-opened',
				leaf: 'file',
			},
		}

		if (item.subItems && item.subItems.length > 0) {
			newItem.subItems = addActionsToTree(item.subItems, selectedUris) // Pass selectedUris
		}
		return newItem
	})
}

// Combine Action adding and Decoration adding
export const transformTreeData = (
	items: VscodeTreeItem[],
	selectedUris: Set<string>, // Renamed from selectedPaths
): VscodeTreeItem[] => {
	const itemsWithActions = addActionsToTree(items, selectedUris) // Pass selectedUris
	return addDecorationsToTree(itemsWithActions, selectedUris) // Pass selectedUris
}

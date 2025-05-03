import type * as vscode from 'vscode'

// Define the structure expected by the vscode-tree component
export interface VscodeTreeAction {
	icon: string
	actionId: string
	tooltip: string
}

export interface VscodeTreeItem {
	label: string // File/Folder name
	value: string // Use relative path as the value
	subItems?: VscodeTreeItem[] // Children for folders
	open?: boolean // Default state for folders (optional)
	selected?: boolean // Selection state (optional)
	icons: {
		branch: string
		leaf: string
		open: string
	}
	// Add decorations based on VS Code Tree item structure
	decorations?: {
		badge?: string | number
		tooltip?: string
		iconPath?:
			| string
			| vscode.Uri
			| { light: string | vscode.Uri; dark: string | vscode.Uri }
		color?: string | vscode.ThemeColor
		// Any other properties the vscode-tree component might support for decorations
	}
	actions?: VscodeTreeAction[] // Actions for the item
}

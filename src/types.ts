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
	icons?: {
		branch: string
		leaf: string
		open: string
	}
	actions?: VscodeTreeAction[] // Actions for the item
	// Add decorations based on VS Code Tree item structure
	decorations?: {
		content?: string
		appearance?: 'counter-badge' | 'filled-circle'
		color?: string | any
		tooltip?: string
	}[]
}

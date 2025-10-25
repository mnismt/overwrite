// Message payload types used between the webview and the provider

// FileAction types from xml-parser
export interface FileActionChange {
	search?: string
	content: string
	description: string
	occurrence?: 'first' | 'last' | number
}

export interface FileAction {
	action: 'create' | 'rewrite' | 'modify' | 'delete' | 'rename'
	path: string
	root?: string
	newPath?: string
	changes?: FileActionChange[]
}

export interface OpenFilePayload {
	fileUri: string // Changed from filePath to fileUri (string representation of vscode.Uri)
}

export interface CopyContextPayload {
	selectedUris: string[] // Changed from selectedPaths to selectedUris (array of URI strings)
	userInstructions: string
}

// Payload for getTokenCounts, though it's used inline in the provider,
// defining it here for clarity or future use if refactored.
export interface GetTokenCountsPayload {
	selectedUris: string[] // Array of URI strings
	requestId?: string // Optional client-side request ID for tracking and cancellation
}

export interface GetFileTreePayload {
	excludedFolders?: string // String containing excluded folder patterns, one per line
	readGitignore?: boolean // Whether to respect .gitignore when building the tree
}

export interface SaveSettingsPayload {
	excludedFolders: string
	readGitignore: boolean
}

export interface UpdateSettingsPayload {
	excludedFolders: string
	readGitignore: boolean
}

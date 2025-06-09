// Message payload types used between the webview and the provider

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
}

export interface GetFileTreePayload {
	excludedFolders?: string // String containing excluded folder patterns, one per line
}

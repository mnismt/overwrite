// Message payload types used between the webview and the provider

export interface OpenFilePayload {
	filePath: string
}

export interface CopyContextPayload {
	selectedPaths: string[]
	userInstructions: string
}

export interface ApplyResult {
	path: string
	action: string
	success: boolean
	message: string
}

export interface ApplyChangeResponse {
	command: string
	success: boolean
	results?: ApplyResult[]
	errors?: string[]
}

export interface ApplyResult {
	path: string
	action: string
	success: boolean
	message: string
}

export interface ChangeSummary {
	added: number
	removed: number
}

export interface ChangeBlock {
	description: string
	search?: string
	content: string
}

export interface PreviewTableRow {
	path: string
	action: 'create' | 'rewrite' | 'modify' | 'delete' | 'rename'
	description: string
	changes: ChangeSummary
	newPath?: string
	hasError?: boolean
	errorMessage?: string
	changeBlocks?: ChangeBlock[]
}

export interface PreviewData {
	rows: PreviewTableRow[]
	errors: string[]
}

export interface RowApplyResult {
	rowIndex: number
	path: string
	action: string
	success: boolean
	message: string
	isCascadeFailure?: boolean // Failed because previous row changed the file
}

export interface ApplyChangeResponse {
	command: string
	success: boolean
	results?: ApplyResult[]
	errors?: string[]
	previewData?: PreviewData
}

// Define interfaces for the parsed XML structure
export interface FileAction {
	path: string
	action: 'create' | 'rewrite' | 'modify' | 'delete' | 'rename'
	newPath?: string // For rename action
	changes?: ChangeBlock[]
}

interface ChangeBlock {
	description: string
	search?: string // Only for modify action
	content: string
}

interface ParseResult {
	plan?: string
	fileActions: FileAction[]
	errors: string[]
}

/**
 * Parses an XML-formatted LLM response to extract file actions.
 * @param xmlContent The XML content string from the LLM.
 * @returns Structured representation of the file actions to perform.
 */
export function parseXmlResponse(xmlContent: string): ParseResult {
	const result: ParseResult = {
		fileActions: [],
		errors: [],
	}

	try {
		// Extract plan
		const planMatch = xmlContent.match(/<Plan>([\s\S]*?)<\/Plan>/i)
		if (planMatch?.[1]) {
			result.plan = planMatch[1].trim()
		}

		// Extract file actions
		const fileRegex =
			/<file\s+path="([^"]*)"\s+action="([^"]*)">([\s\S]*?)<\/file>/g
		let fileMatch: RegExpExecArray | null

		// biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
		while ((fileMatch = fileRegex.exec(xmlContent)) !== null) {
			const [, path, action, fileContent] = fileMatch

			if (!path || !action) {
				result.errors.push('Missing required attribute: path or action')
				continue
			}

			const fileAction: FileAction = {
				path,
				action: action as FileAction['action'],
				changes: [],
			}

			// Handle rename action
			if (action === 'rename') {
				const newPathMatch = fileContent.match(/<new\s+path="([^"]*)"\s*\/>/i)
				if (newPathMatch?.[1]) {
					fileAction.newPath = newPathMatch[1]
				} else {
					result.errors.push(
						`Missing <new> element for rename action on: ${path}`,
					)
				}
			} else {
				// Extract change blocks
				const changeRegex = /<change>([\s\S]*?)<\/change>/g
				let changeMatch: RegExpExecArray | null

				// biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
				while ((changeMatch = changeRegex.exec(fileContent)) !== null) {
					const changeContent = changeMatch[1]

					// Extract description
					const descMatch = changeContent.match(
						/<description>([\s\S]*?)<\/description>/i,
					)
					const description = descMatch
						? descMatch[1].trim()
						: 'No description provided'

					// Extract search block for modify
					let search: string | undefined
					if (action === 'modify') {
						const searchMatch = changeContent.match(
							/<search>([\s\S]*?)<\/search>/i,
						)
						if (searchMatch?.[1]) {
							search = extractContentBetweenMarkers(searchMatch[1])
						}
					}

					// Extract content
					let content = ''
					const contentMatch = changeContent.match(
						/<content>([\s\S]*?)<\/content>/i,
					)
					if (contentMatch?.[1]) {
						content = extractContentBetweenMarkers(contentMatch[1]) || ''
					}

					fileAction.changes!.push({
						description,
						search,
						content,
					})
				}
			}

			result.fileActions.push(fileAction)
		}
	} catch (error) {
		result.errors.push(`Failed to parse XML: ${error}`)
	}

	return result
}

/**
 * Extracts content between === markers in the LLM response.
 * @param text The raw text containing === markers.
 * @returns The extracted content or undefined if not found.
 */
function extractContentBetweenMarkers(text: string): string | undefined {
	// Text is expected to have format:
	// ===
	// content here
	// ===
	const trimmedText = text.trim()
	const markerPattern = /^===\r?\n([\s\S]*?)\r?\n===$/

	const match = trimmedText.match(markerPattern)
	return match ? match[1] : undefined
}

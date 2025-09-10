// Define interfaces for the parsed XML structure
export interface FileAction {
	path: string
	action: 'create' | 'rewrite' | 'modify' | 'delete' | 'rename'
	newPath?: string // For rename action (can be relative to workspace)
	root?: string // Optional workspace root name for multi-root workspaces
	changes?: ChangeBlock[]
}

interface ChangeBlock {
	description: string
	search?: string // Only for modify action
	content: string
	occurrence?: 'first' | 'last' | number // Optional disambiguator for modify
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
		// 1) Sanitize copy-pasted chat text (trim fences, leading/trailing chatter)
		const cleaned = sanitizeResponse(xmlContent)
		// Extract plan
		const planMatch = cleaned.match(/<\s*Plan\s*>([\s\S]*?)<\/\s*Plan\s*>/i)
		if (planMatch?.[1]) {
			result.plan = planMatch[1].trim()
		}

		// Extract file actions
		const fileRegex = /<file\s+([^>]*)>([\s\S]*?)<\/\s*file\s*>/gi
		let fileMatch: RegExpExecArray | null

		// biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
		while ((fileMatch = fileRegex.exec(cleaned)) !== null) {
			const [, rawAttrs, fileContent] = fileMatch
			const attrs = parseAttributes(rawAttrs)
			const pathAttr = attrs.path
			const actionAttr = attrs.action

			if (!pathAttr || !actionAttr) {
				result.errors.push('Missing required attribute: path or action')
				continue
			}

			const fileAction: FileAction = {
				path: pathAttr,
				action: actionAttr as FileAction['action'],
				changes: [],
				root: attrs.root,
			}

			// Handle rename action
			if (actionAttr === 'rename') {
				const newPathMatch = fileContent.match(/<new\s+path="([^"]*)"\s*\/>/i)
				if (newPathMatch?.[1]) {
					fileAction.newPath = newPathMatch[1]
				} else {
					result.errors.push(
						`Missing <new> element for rename action on: ${pathAttr}`,
					)
				}
			} else {
				// Extract change blocks
				const changeRegex = /<\s*change\s*>([\s\S]*?)<\/\s*change\s*>/gi
				let changeMatch: RegExpExecArray | null

				// biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
				while ((changeMatch = changeRegex.exec(fileContent)) !== null) {
					const changeContent = changeMatch[1]

					// Extract description
					const descMatch = changeContent.match(
						/<\s*description\s*>([\s\S]*?)<\/\s*description\s*>/i,
					)
					const description = descMatch
						? descMatch[1].trim()
						: 'No description provided'

					// Extract search block for modify
					let search: string | undefined
					if (actionAttr === 'modify') {
						const searchMatch = changeContent.match(
							/<\s*search\s*>([\s\S]*?)<\/\s*search\s*>/i,
						)
						if (searchMatch?.[1]) {
							search = extractContentBetweenMarkers(searchMatch[1])
						}
					}

					// Extract content
					let content = ''
					const contentMatch = changeContent.match(
						/<\s*content\s*>([\s\S]*?)<\/\s*content\s*>/i,
					)
					if (contentMatch?.[1]) {
						content = extractContentBetweenMarkers(contentMatch[1]) || ''
					}

					// Optional occurrence disambiguator
					let occurrence: ChangeBlock['occurrence']
					const occMatch = changeContent.match(
						/<\s*occurrence\s*>([\s\S]*?)<\/\s*occurrence\s*>/i,
					)
					if (occMatch?.[1]) {
						const occRaw = occMatch[1].trim().toLowerCase()
						if (occRaw === 'first' || occRaw === 'last') {
							occurrence = occRaw
						} else {
							const n = Number.parseInt(occRaw, 10)
							if (!Number.isNaN(n) && n > 0) occurrence = n
						}
					}

					fileAction.changes!.push({
						description,
						search,
						content,
						occurrence,
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
  // Be liberal: accept markers with or without surrounding newlines/whitespace.
  // We look for the first '===' and the last '===' and trim whitespace around them.
  const s = text.trim()
  const first = s.indexOf('===')
  if (first === -1) return undefined
  const last = s.lastIndexOf('===')
  if (last === -1 || last <= first) return undefined
  // Start after the first marker and skip optional whitespace/newlines
  let start = first + 3
  while (start < s.length && /[ \t\r\n]/.test(s[start]!)) start++
  // End before the last marker, trim trailing whitespace/newlines
  let end = last
  let endTrim = end - 1
  while (endTrim >= 0 && /[ \t\r\n]/.test(s[endTrim]!)) endTrim--
  if (endTrim < start) return ''
  return s.slice(start, endTrim + 1)
}

/**
 * Strips leading/trailing noise: code fences, chat preambles/epilogues.
 * Keeps the slice from the first <Plan|file> to the last </Plan|file>.
 */
function sanitizeResponse(raw: string): string {
  let s = raw.trim()
  // Remove triple backtick fences if present
  if (s.startsWith('```')) {
    // Drop opening fence line
    s = s.replace(/^```[\w-]*\s*\n?/, '')
  }
  if (s.endsWith('```')) {
    s = s.replace(/\n?```\s*$/, '')
  }
  // Find useful XML region
  const startIdxOptions = [
    s.indexOf('<file '),
    s.indexOf('<Plan'),
  ].filter((i) => i >= 0) as number[]
  const startIdx = startIdxOptions.length ? Math.min(...startIdxOptions) : -1
  if (startIdx >= 0) s = s.slice(startIdx)

  // Determine end by the last closing tag of interest
  const lastCloseFile = s.lastIndexOf('</file>')
  const lastClosePlan1 = s.lastIndexOf('</Plan>')
  const lastClosePlan2 = s.lastIndexOf('</plan>')
  const lastClose = Math.max(lastCloseFile, lastClosePlan1, lastClosePlan2)
  if (lastClose > -1) {
    // Include the closing tag
    const end = lastClose + (s.slice(lastClose).toLowerCase().startsWith('</file>') ? 7 : 7)
    s = s.slice(0, end)
  }
  return s.trim()
}

/**
 * Parses attributes from a tag attribute string into a key-value map.
 */
function parseAttributes(attrString: string): Record<string, string> {
	const attrs: Record<string, string> = {}
	// Matches key="value" pairs, ignoring order and whitespace
	const regex = /(\w+)\s*=\s*"([^"]*)"/g
	let match: RegExpExecArray | null
	// biome-ignore lint/suspicious/noAssignInExpressions: iterative regex exec
	while ((match = regex.exec(attrString)) !== null) {
		attrs[match[1]] = match[2]
	}
	return attrs
}

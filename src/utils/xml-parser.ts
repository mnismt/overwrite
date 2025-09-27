// Define interfaces for the parsed XML structure (public API remains the same)
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
	// OPX does not define a plan; keep for tolerance with existing callers
	plan?: string
	fileActions: FileAction[]
	errors: string[]
}

/**
 * Parses OPX (Overwrite Patch XML) responses and returns unified FileAction[]
 * OPX-only: accepts <edit ...> (optionally wrapped in <opx>...</opx>)
 *
 * op mapping:
 * - new     -> create (requires <put>)
 * - patch   -> modify (requires <find> and <put>)
 * - replace -> rewrite (requires <put>)
 * - remove  -> delete (no children)
 * - move    -> rename (requires <to file="..."/>)
 */
export function parseXmlResponse(xmlContent: string): ParseResult {
	const result: ParseResult = { fileActions: [], errors: [] }

	try {
		const cleaned = sanitizeResponse(xmlContent)
		if (!cleaned) {
			return { fileActions: [], errors: ['Empty input'] }
		}

		// 1) Collect <edit .../> and <edit>...</edit> with document order preserved
		const edits: Array<{
			index: number
			attrs: Record<string, string>
			body: string | null
		}> = []

		// Self-closing edits (e.g., op="remove")
		const selfClosingRegex = /<\s*edit\b([^>]*)\/>/gi
		for (const m of cleaned.matchAll(selfClosingRegex)) {
			edits.push({
				index: m.index ?? 0,
				attrs: parseAttributes(m[1] ?? ''),
				body: null,
			})
		}

		// Paired edits
		const pairedRegex = /<\s*edit\b([^>]*)>([\s\S]*?)<\s*\/\s*edit\s*>/gi
		for (const m of cleaned.matchAll(pairedRegex)) {
			edits.push({
				index: m.index ?? 0,
				attrs: parseAttributes(m[1] ?? ''),
				body: m[2] ?? '',
			})
		}

		edits.sort((a, b) => a.index - b.index)

		if (edits.length === 0) {
			return {
				fileActions: [],
				errors: ['No <edit> elements found (expecting OPX)'],
			}
		}

		let idx = 0
		for (const e of edits) {
			idx += 1
			const file = e.attrs.file
			const op = (e.attrs.op || '').toLowerCase()
			const root = e.attrs.root

			if (!file || !op) {
				const trimmed = Object.entries(e.attrs)
					.map(([k, v]) => `${k}="${v}"`)
					.join(' ')
				result.errors.push(
					`Edit #${idx}: missing required attribute(s): ${!file ? 'file ' : ''}${
						!op ? 'op' : ''
					}. attrs="${trimmed}"`,
				)
				continue
			}

			const action = mapOpToAction(op)
			if (!action) {
				result.errors.push(`Edit #${idx}: unknown op="${op}"`)
				continue
			}

			const fileAction: FileAction = { path: file, action, root, changes: [] }

			try {
				switch (op) {
					case 'move': {
						// <to file="..." /> inside body
						const body = e.body || ''
						const toMatch = body.match(/<\s*to\b([^>]*)\/>/i)
						const toAttrs = parseAttributes(toMatch?.[1] ?? '')
						const newPath = toAttrs.file
						if (!newPath) {
							throw new Error('Missing <to file="..."/> for move')
						}
						fileAction.newPath = newPath
						break
					}
					case 'remove': {
						// nothing else needed
						break
					}
					case 'new':
					case 'replace': {
						const body = e.body || ''
						const putMatch = body.match(
							/<\s*put\s*>([\s\S]*?)<\s*\/\s*put\s*>/i,
						)
						if (!putMatch) throw new Error('Missing <put> block')
						const content =
							extractBetweenMarkers(putMatch[1] ?? '', '<<<', '>>>') ?? ''
						fileAction.changes!.push({
							description:
								extractWhy(body) ??
								(op === 'new' ? 'Create file' : 'Replace file'),
							content,
						})
						break
					}
					case 'patch': {
						const body = e.body || ''
						const findMatch = body.match(
							/<\s*find\b([^>]*)>([\s\S]*?)<\s*\/\s*find\s*>/i,
						)
						const putMatch = body.match(
							/<\s*put\s*>([\s\S]*?)<\s*\/\s*put\s*>/i,
						)
						if (!findMatch || !putMatch)
							throw new Error('Missing <find> or <put> for patch')
						const findAttrs = parseAttributes(findMatch[1] ?? '')
						const occurrenceRaw = (findAttrs.occurrence || '').toLowerCase()
						let occurrence: ChangeBlock['occurrence']
						if (occurrenceRaw === 'first' || occurrenceRaw === 'last')
							occurrence = occurrenceRaw
						else if (occurrenceRaw) {
							const n = Number.parseInt(occurrenceRaw, 10)
							if (!Number.isNaN(n) && n > 0) occurrence = n
						}
						const search = extractBetweenMarkers(
							findMatch[2] ?? '',
							'<<<',
							'>>>',
						)
						const content =
							extractBetweenMarkers(putMatch[1] ?? '', '<<<', '>>>') ?? ''
						if (!search)
							throw new Error('Empty or missing marker block in <find>')
						fileAction.changes!.push({
							description: extractWhy(body) ?? 'Patch region',
							search,
							content,
							occurrence,
						})
						break
					}
				}

				result.fileActions.push(fileAction)
			} catch (err) {
				result.errors.push(
					`Edit #${idx} (${file}): ${err instanceof Error ? err.message : String(err)}`,
				)
			}
		}
	} catch (error) {
		result.errors.push(`Failed to parse OPX: ${error}`)
	}

	return result
}

/** Extract simple description from <why> if present */
function extractWhy(body: string): string | undefined {
	const m = body.match(/<\s*why\s*>([\s\S]*?)<\s*\/\s*why\s*>/i)
	return m?.[1]?.trim()
}

/**
 * Extracts content between custom markers like <<< and >>>, trimming outer whitespace.
 */
function extractBetweenMarkers(
	text: string,
	start: string,
	end: string,
): string | undefined {
	const s = text.trim()
	const first = s.indexOf(start)
	if (first === -1) return undefined
	const last = s.lastIndexOf(end)
	if (last === -1 || last <= first) return undefined
	let startIdx = first + start.length
	while (startIdx < s.length && /[ \t\r\n]/.test(s[startIdx]!)) startIdx++
	let endIdx = last - 1
	while (endIdx >= 0 && /[ \t\r\n]/.test(s[endIdx]!)) endIdx--
	if (endIdx < startIdx) return ''
	return s.slice(startIdx, endIdx + 1)
}

/**
 * Strips leading/trailing noise: code fences, chat preambles/epilogues.
 * Keeps the slice from the first <edit|opx> to the last </edit|/opx>.
 */
function sanitizeResponse(raw: string): string {
	let s = raw.trim()
	if (!s) return ''
	// Remove triple backtick fences if present
	if (s.startsWith('```')) s = s.replace(/^```[\w-]*\s*\n?/, '')
	if (s.endsWith('```')) s = s.replace(/\n?```\s*$/, '')

	// If wrapped in <opx>...</opx>, keep inner slice; else start at first <edit>
	const opxStart = s.indexOf('<opx')
	const editStart = s.indexOf('<edit ')
	const startIdxOptions = [opxStart, editStart].filter(
		(i) => i >= 0,
	) as number[]
	const startIdx = startIdxOptions.length ? Math.min(...startIdxOptions) : -1
	if (startIdx >= 0) s = s.slice(startIdx)

	// Determine end by the last closing tag of interest
	const lastCloseEdit = s.lastIndexOf('</edit>')
	const lastCloseOpx = s.lastIndexOf('</opx>')
	const lastClose = Math.max(lastCloseEdit, lastCloseOpx)
	if (lastClose > -1) {
		const isOpx = s.slice(lastClose).toLowerCase().startsWith('</opx>')
		const end = lastClose + (isOpx ? 6 : 7)
		s = s.slice(0, end)
	}
	return s.trim()
}

/**
 * Parses attributes from a tag attribute string into a key-value map.
 * Accepts both double and single quotes and lowercases keys.
 */
function parseAttributes(attrString: string): Record<string, string> {
	const attrs: Record<string, string> = {}
	const regex = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
	let match: RegExpExecArray | null
	// biome-ignore lint/suspicious/noAssignInExpressions: iterative regex exec
	while ((match = regex.exec(attrString)) !== null) {
		const key = match[1].toLowerCase()
		const val = match[2] !== undefined ? match[2] : (match[3] ?? '')
		attrs[key] = val
	}
	return attrs
}

function mapOpToAction(op: string): FileAction['action'] | null {
	switch (op) {
		case 'new':
			return 'create'
		case 'patch':
			return 'modify'
		case 'replace':
			return 'rewrite'
		case 'remove':
			return 'delete'
		case 'move':
			return 'rename'
		default:
			return null
	}
}

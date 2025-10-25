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

		const edits = collectEdits(cleaned)
		if (edits.length === 0) {
			return {
				fileActions: [],
				errors: ['No <edit> elements found (expecting OPX)'],
			}
		}

		for (const [idx, edit] of edits.entries()) {
			const { action, error } = buildFileAction(edit, idx + 1)
			if (action) {
				result.fileActions.push(action)
			} else if (error) {
				result.errors.push(error)
			}
		}
	} catch (error) {
		result.errors.push(`Failed to parse OPX: ${error}`)
	}

	return result
}

interface ParsedEdit {
	index: number
	attrs: Record<string, string>
	body: string | null
}

function collectEdits(xml: string): ParsedEdit[] {
	const edits: ParsedEdit[] = []

	const selfClosingRegex = /<\s*edit\b([^>]*)\/>/gi
	for (const match of xml.matchAll(selfClosingRegex)) {
		edits.push({
			index: match.index ?? 0,
			attrs: parseAttributes(match[1] ?? ''),
			body: null,
		})
	}

	const pairedRegex = /<\s*edit\b([^>]*)>([\s\S]*?)<\s*\/\s*edit\s*>/gi
	for (const match of xml.matchAll(pairedRegex)) {
		edits.push({
			index: match.index ?? 0,
			attrs: parseAttributes(match[1] ?? ''),
			body: match[2] ?? '',
		})
	}

	return edits.sort((a, b) => a.index - b.index)
}

function buildFileAction(
	edit: ParsedEdit,
	displayIndex: number,
): { action?: FileAction; error?: string } {
	const file = edit.attrs.file
	const op = (edit.attrs.op || '').toLowerCase()

	if (file && op) {
		const action = mapOpToAction(op)
		if (!action) {
			return { error: `Edit #${displayIndex}: unknown op="${op}"` }
		}

		const fileAction: FileAction = {
			path: file,
			action,
			root: edit.attrs.root,
			changes: [],
		}

		try {
			applyOpHandler(op, edit, fileAction)
			return { action: fileAction }
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			return { error: `Edit #${displayIndex} (${file}): ${message}` }
		}
	}

	const trimmedAttrs = Object.entries(edit.attrs)
		.map(([k, v]) => `${k}="${v}"`)
		.join(' ')
	return {
		error: `Edit #${displayIndex}: missing required attribute(s): ${
			file ? '' : 'file '
		}${op ? '' : 'op'}. attrs="${trimmedAttrs}"`,
	}
}

type HandlerContext = {
	op: string
	body: string
	edit: ParsedEdit
	fileAction: FileAction
}

const opHandlers: Record<string, (ctx: HandlerContext) => void> = {
	move: handleMove,
	remove: () => {},
	new: handleCreateOrReplace,
	replace: handleCreateOrReplace,
	patch: handlePatch,
}

function applyOpHandler(
	op: string,
	edit: ParsedEdit,
	fileAction: FileAction,
): void {
	const handler = opHandlers[op]
	if (handler) {
		handler({ op, edit, body: edit.body ?? '', fileAction })
	}
}

function handleMove({ body, fileAction }: HandlerContext): void {
	const toMatch = /<\s*to\b([^>]*)\/>/i.exec(body)
	const toAttrs = parseAttributes(toMatch?.[1] ?? '')
	const newPath = toAttrs.file
	if (!newPath) {
		throw new Error('Missing <to file="..."/> for move')
	}
	fileAction.newPath = newPath
}

function handleCreateOrReplace({ body, op, fileAction }: HandlerContext): void {
	const putMatch = /<\s*put\s*>([\s\S]*?)<\s*\/\s*put\s*>/i.exec(body)
	if (!putMatch) throw new Error('Missing <put> block')
	const content = extractBetweenMarkers(putMatch[1] ?? '', '<<<', '>>>') ?? ''
	fileAction.changes!.push({
		description:
			extractWhy(body) ?? (op === 'new' ? 'Create file' : 'Replace file'),
		content,
	})
}

function handlePatch({ body, fileAction }: HandlerContext): void {
	const findMatch = /<\s*find\b([^>]*)>([\s\S]*?)<\s*\/\s*find\s*>/i.exec(body)
	const putMatch = /<\s*put\s*>([\s\S]*?)<\s*\/\s*put\s*>/i.exec(body)
	if (!findMatch || !putMatch)
		throw new Error('Missing <find> or <put> for patch')

	const findAttrs = parseAttributes(findMatch[1] ?? '')
	const occurrence = normalizeOccurrence(findAttrs.occurrence)
	const search = extractBetweenMarkers(findMatch[2] ?? '', '<<<', '>>>')
	if (!search) throw new Error('Empty or missing marker block in <find>')
	const content = extractBetweenMarkers(putMatch[1] ?? '', '<<<', '>>>') ?? ''

	fileAction.changes!.push({
		description: extractWhy(body) ?? 'Patch region',
		search,
		content,
		occurrence,
	})
}

function normalizeOccurrence(
	occurrenceRaw?: string,
): ChangeBlock['occurrence'] {
	if (!occurrenceRaw) return undefined
	const normalized = occurrenceRaw.toLowerCase()
	if (normalized === 'first' || normalized === 'last') return normalized
	const numeric = Number.parseInt(normalized, 10)
	return !Number.isNaN(numeric) && numeric > 0 ? numeric : undefined
}

const WHY_TAG_REGEX = /<\s*why\s*>([\s\S]*?)<\s*\/\s*why\s*>/i

/** Extract simple description from <why> if present */
function extractWhy(body: string): string | undefined {
	const match = WHY_TAG_REGEX.exec(body)
	return match?.[1]?.trim()
}

/**
 * Extracts content between custom markers like <<< and >>>, trimming outer whitespace.
 */
function extractBetweenMarkers(
	text: string,
	start: string,
	end: string,
): string | undefined {
	// Auto-heal common markdown/chat truncation of marker lines inside literal blocks.
	// If a line contains only "<" or "<<", treat it as the opening marker "<<<".
	// If a line contains only ">" or ">>", treat it as the closing marker ">>>".
	let s = text.trim()
	// Repair before searching for markers; operate on full-line matches only.
	s = s
		.replaceAll(/^[ \t]*<\s*$/gm, '<<<')
		.replaceAll(/^[ \t]*<<\s*$/gm, '<<<')
		.replaceAll(/^[ \t]*>\s*$/gm, '>>>')
		.replaceAll(/^[ \t]*>>\s*$/gm, '>>>')

	const first = s.indexOf(start)
	if (first === -1) return undefined
	const last = s.lastIndexOf(end)
	if (last === -1 || last <= first) return undefined
	let startIdx = first + start.length
	while (startIdx < s.length && /[ \t\r\n]/.test(s.charAt(startIdx))) startIdx++
	let endIdx = last - 1
	while (endIdx >= 0 && /[ \t\r\n]/.test(s.charAt(endIdx))) endIdx--
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
	const startIdxOptions = [opxStart, editStart].filter((i) => i >= 0)
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
		const val = match[2] ?? match[3] ?? ''
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

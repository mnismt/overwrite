// Lightweight, safe pre-processing for XML-like LLM responses used by Apply tab.
// Goals:
// - Normalize attribute quotes in <file ...> and <new .../> tags (single -> double)
// - Normalize curly quotes to ASCII
// - Lowercase attribute keys (path, action, root, etc.)
// - Do NOT touch text inside <content>...</content>

export interface PreprocessResult {
	text: string
	changes: string[] // informational notes about what was normalized
	issues: string[] // lint-like warnings detected pre-parse
}

// Extract <content> blocks and replace with placeholders to avoid mutating code.
function extractContentBlocks(input: string): {
	masked: string
	blocks: string[]
} {
	const blocks: string[] = []
	let masked = input
	const contentRegex = /<\s*content\s*>([\s\S]*?)<\s*\/\s*content\s*>/gi
	masked = masked.replace(contentRegex, (_m, inner) => {
		const i = blocks.length
		blocks.push(inner)
		return `__OW_CONTENT_BLOCK_${i}__`
	})
	return { masked, blocks }
}

function restoreContentBlocks(input: string, blocks: string[]): string {
	return input.replace(/__OW_CONTENT_BLOCK_(\d+)__/g, (_m, idxStr) => {
		const idx = Number(idxStr)
		return `<content>${blocks[idx] ?? ''}</content>`
	})
}

// Normalize curly quotes globally in non-content area.
function normalizeCurlyQuotes(s: string): { out: string; changed: boolean } {
	const before = s
	const out = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
	return { out, changed: out !== before }
}

// Lowercase attribute keys and convert single-quoted values to double quotes inside a single tag string.
function normalizeTagAttributes(tag: string): {
	out: string
	changed: boolean
} {
	const before = tag
	let out = tag
	// Convert single-quoted values to double-quoted for any key=value pair
	out = out.replace(/(\w+)\s*=\s*'([^']*)'/g, (_m, k, v) => `${k}="${v}"`)
	// Lowercase attribute keys
	out = out.replace(
		/(\b\w+)(\s*=\s*"[^"]*")/g,
		(_m, k, rest) => k.toLowerCase() + rest,
	)
	return { out, changed: out !== before }
}

// Runs on the whole non-content text, but only mutates recognized opening tags.
function normalizeAttributeZones(nonContent: string): {
	out: string
	changeNotes: string[]
} {
	let out = nonContent
	const notes: string[] = []

	const replaceInMatches = (regex: RegExp, label: string) => {
		out = out.replace(regex, (tag) => {
			const { out: fixed, changed } = normalizeTagAttributes(tag)
			if (changed)
				notes.push(
					`Normalized ${label} attributes: single → double quotes, lowercased keys`,
				)
			return fixed
		})
	}

	// Only adjust <file ...> opening tags and <new .../> tags
	replaceInMatches(/<\s*file\b[^>]*>/gi, '<file>')
	replaceInMatches(/<\s*new\b[^>]*\/>/gi, '<new/>')

	return { out, changeNotes: notes }
}

// Lint: detect missing required attributes in <file ...> tags after normalization.
function lintFileTags(nonContent: string): string[] {
	const issues: string[] = []
	const fileTagRegex = /<\s*file\b([^>]*)>/gi
	let idx = 0
	for (const m of nonContent.matchAll(fileTagRegex)) {
		idx++
		const attrStr = m[1] ?? ''
		const attrs: Record<string, string> = {}
		const attrRegex = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
		for (const a of attrStr.matchAll(attrRegex)) {
			const key = (a[1] || '').toLowerCase()
			const val = a[2] !== undefined ? a[2] : (a[3] ?? '')
			attrs[key] = val
		}
		if (!attrs.path || !attrs.action) {
			const trimmed = attrStr.trim().slice(0, 120)
			const missing = [!attrs.path && 'path', !attrs.action && 'action']
				.filter(Boolean)
				.join(' and ')
			issues.push(`File #${idx}: missing ${missing} (attrs="${trimmed}")`)
		}
	}
	return issues
}

export function preprocessXmlText(input: string): PreprocessResult {
	const changes: string[] = []
	const issues: string[] = []

	// Protect <content> blocks
	const { masked, blocks } = extractContentBlocks(input)

	// Normalize curly quotes
	const curly = normalizeCurlyQuotes(masked)
	if (curly.changed) changes.push('Replaced curly quotes with ASCII quotes')

	// Normalize attribute zones
	const attr = normalizeAttributeZones(curly.out)
	changes.push(...attr.changeNotes)

	// Lint after normalization
	issues.push(...lintFileTags(attr.out))

	// Restore <content> blocks
	const restored = restoreContentBlocks(attr.out, blocks)

	return { text: restored, changes, issues }
}

// For on-change lint without mutating user text (we still protect content)
export function lintXmlText(input: string): string[] {
	const { masked } = extractContentBlocks(input)
	const curly = normalizeCurlyQuotes(masked)
	const attr = normalizeAttributeZones(curly.out)
	return lintFileTags(attr.out)
}

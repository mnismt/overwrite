// Lightweight, safe pre-processing for XML-like LLM responses used by Apply tab.
// Goals:
// - Normalize attribute quotes in OPX tags: <edit ...> and <to .../>
// - Normalize curly quotes to ASCII
// - Lowercase attribute keys (file, op, root, occurrence, etc.)
// - Do NOT touch text inside literal payload blocks (<put>, <find>) or other content tags

export interface PreprocessResult {
	text: string
	changes: string[] // informational notes about what was normalized
	issues: string[] // lint-like warnings detected pre-parse
}

// Extract <put> / <find> / <content> blocks and replace with placeholders to avoid mutating code.
function extractContentBlocks(input: string): {
	masked: string
	blocks: Array<{ tag: 'put' | 'find' | 'content'; inner: string }>
} {
	const blocks: Array<{ tag: 'put' | 'find' | 'content'; inner: string }> = []
	let masked = input
	const blockRegex =
		/<\s*(put|find|content)\s*[^>]*>([\s\S]*?)<\s*\/\s*(put|find|content)\s*>/gi
	masked = masked.replace(blockRegex, (_m, openTag: string, inner: string) => {
		const i = blocks.length
		const tag = (openTag as 'put' | 'find' | 'content')
		blocks.push({ tag, inner })
		return `__OW_TAG_${tag}_BLOCK_${i}__`
	})
	return { masked, blocks }
}

function restoreContentBlocks(
	input: string,
	blocks: Array<{ tag: 'put' | 'find' | 'content'; inner: string }>,
): string {
	return input.replace(/__OW_TAG_(put|find|content)_BLOCK_(\d+)__/g, (_m, t, i) => {
		const idx = Number(i)
		const tag = t as 'put' | 'find' | 'content'
		const inner = blocks[idx]?.inner ?? ''
		return `<${tag}>${inner}</${tag}>`
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

	// OPX: adjust <edit ...> opening tags and <to .../> tags
	replaceInMatches(/<\s*edit\b[^>]*>/gi, '<edit>')
	replaceInMatches(/<\s*to\b[^>]*\/>/gi, '<to/>')

	return { out, changeNotes: notes }
}

// Lint: detect missing required attributes in <edit ...> tags after normalization.
function lintEditTags(nonContent: string): string[] {
	const issues: string[] = []
	const editTagRegex = /<\s*edit\b([^>]*)>/gi
	let idx = 0
	for (const m of nonContent.matchAll(editTagRegex)) {
		idx++
		const attrStr = m[1] ?? ''
		const attrs: Record<string, string> = {}
		const attrRegex = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
		for (const a of attrStr.matchAll(attrRegex)) {
			const key = (a[1] || '').toLowerCase()
			const val = a[2] !== undefined ? a[2] : (a[3] ?? '')
			attrs[key] = val
		}
		if (!attrs.file || !attrs.op) {
			const trimmed = attrStr.trim().slice(0, 120)
			const missing = [!attrs.file && 'file', !attrs.op && 'op']
				.filter(Boolean)
				.join(' and ')
			issues.push(`Edit #${idx}: missing ${missing} (attrs="${trimmed}")`)
		}
	}
	return issues
}

export function preprocessXmlText(input: string): PreprocessResult {
	const changes: string[] = []
	const issues: string[] = []

	// Protect literal blocks
	const { masked, blocks } = extractContentBlocks(input)

	// Normalize curly quotes
	const curly = normalizeCurlyQuotes(masked)
	if (curly.changed) changes.push('Replaced curly quotes with ASCII quotes')

	// Normalize attribute zones
	const attr = normalizeAttributeZones(curly.out)
	changes.push(...attr.changeNotes)

	// Lint after normalization
	issues.push(...lintEditTags(attr.out))

	// Restore content blocks
	const restored = restoreContentBlocks(attr.out, blocks)

	return { text: restored, changes, issues }
}

// For on-change lint without mutating user text (we still protect content)
export function lintXmlText(input: string): string[] {
	const { masked } = extractContentBlocks(input)
	const curly = normalizeCurlyQuotes(masked)
	const attr = normalizeAttributeZones(curly.out)
	return lintEditTags(attr.out)
}

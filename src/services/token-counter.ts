import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import * as vscode from 'vscode'
import { looksBinary } from '../utils/file-system'
import { telemetry } from './telemetry'

/**
 * A singleton, long-lived tokenizer.
 * Creating it once shaves tens of ms off every request.
 */
let enc: { encode: (text: string) => number[] } | null = null
let pLimit: (<T>(fn: () => Promise<T>) => Promise<T>) | null = null

async function getEncoder() {
	if (!enc) {
		const { Tiktoken } = await import('js-tiktoken/lite')
		const { default: o200k_base } = await import('js-tiktoken/ranks/o200k_base')
		enc = new Tiktoken(o200k_base)
	}
	return enc
}

async function getLimit() {
	if (!pLimit) {
		const limitModule = await import('p-limit')
		pLimit = limitModule.default(MAX_PARALLEL)
	}
	return pLimit
}

/** Guardrails */
const MAX_BYTES = 5 * 1024 * 1024 // skip files > 5 MB (configurable)
const MAX_PARALLEL = 8 // don't read more than N files at once

/**
 * Memoises {mtime, size, tokens}. Simple Map == O(1) look-ups,
 * cleared on *extension* deactivate / workspace close.
 */
const cache = new Map<string, { mtime: number; size: number; tokens: number }>()

/**
 * Interface for skipped file results
 */
export interface SkippedFileInfo {
	uri: string
	reason: 'binary' | 'too-large' | 'error'
	message?: string
}

/**
 * Core: return an **exact** token count, or 0 if skipped.
 */
export async function countTokens(uri: vscode.Uri): Promise<number> {
	try {
		const stats = await stat(uri.fsPath)
		const mtime = Math.floor(stats.mtime.getTime() / 1000)
		const size = stats.size

		// 1️⃣ Cache hit?
		const key = uri.fsPath
		const entry = cache.get(key)
		if (entry && entry.mtime === mtime && entry.size === size) {
			return entry.tokens
		}

		// 2️⃣ Safeguards
		if (size > MAX_BYTES) {
			return 0
		}

		const encoder = await getEncoder()

		// 3️⃣ Stream + incremental encode → memory stays flat
		return new Promise<number>((resolve, reject) => {
			let tokens = 0
			let firstChunkProcessed = false
			let hasError = false

			const stream = createReadStream(uri.fsPath, { highWaterMark: 64_000 })

			stream.on('data', (chunk: Buffer | string) => {
				if (hasError) return

				const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)

				if (!firstChunkProcessed) {
					firstChunkProcessed = true
					if (looksBinary(buf)) {
						// early out for binaries
						hasError = true
						stream.destroy()
						resolve(0)
						return
					}
				}

				try {
					const text = buf.toString('utf8')
					tokens += encoder.encode(text).length
				} catch (error) {
					hasError = true
					stream.destroy()
					reject(error)
				}
			})

			stream.on('error', (error) => {
				hasError = true
				// Track token counting errors
				try {
					telemetry.trackUnhandled('backend', error)
				} catch (e) {
					console.warn('[telemetry] failed to track token counter error', e)
				}
				reject(error)
			})

			stream.on('end', () => {
				if (!hasError) {
					cache.set(key, { mtime, size, tokens })
					resolve(tokens)
				}
			})
		})
	} catch (error) {
		// File doesn't exist or can't be accessed
		return 0
	}
}

/**
 * Enhanced version that returns both token counts and skipped files info
 */
export async function countTokensWithInfo(uri: vscode.Uri): Promise<{
	tokens: number
	skipped?: SkippedFileInfo
}> {
	try {
		const stats = await vscode.workspace.fs.stat(uri)

		// Only process files
		if (stats.type !== vscode.FileType.File) {
			return { tokens: 0 }
		}

		const stats2 = await stat(uri.fsPath)
		const mtime = Math.floor(stats2.mtime.getTime() / 1000)
		const size = stats2.size

		// 1️⃣ Cache hit?
		const key = uri.fsPath
		const entry = cache.get(key)
		if (entry && entry.mtime === mtime && entry.size === size) {
			return { tokens: entry.tokens }
		}

		// 2️⃣ Safeguards
		if (size > MAX_BYTES) {
			return {
				tokens: 0,
				skipped: {
					uri: uri.toString(),
					reason: 'too-large',
					message: `File too large (${(size / 1024 / 1024).toFixed(1)} MB)`,
				},
			}
		}

		const encoder = await getEncoder()

		// 3️⃣ Stream + incremental encode → memory stays flat
		return new Promise<{ tokens: number; skipped?: SkippedFileInfo }>(
			(resolve, reject) => {
				let tokens = 0
				let firstChunkProcessed = false
				let hasError = false

				const stream = createReadStream(uri.fsPath, { highWaterMark: 64_000 })

				stream.on('data', (chunk: Buffer | string) => {
					if (hasError) return

					const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)

					if (!firstChunkProcessed) {
						firstChunkProcessed = true
						if (looksBinary(buf)) {
							// early out for binaries
							hasError = true
							stream.destroy()
							resolve({
								tokens: 0,
								skipped: {
									uri: uri.toString(),
									reason: 'binary',
									message: 'Binary file detected',
								},
							})
							return
						}
					}

					try {
						const text = buf.toString('utf8')
						tokens += encoder.encode(text).length
					} catch (error) {
						hasError = true
						stream.destroy()
						reject(error)
					}
				})

				stream.on('error', (error) => {
					hasError = true
					// Track token counting errors
					try {
						telemetry.trackUnhandled('backend', error)
					} catch (e) {
						console.warn('[telemetry] failed to track token counter error', e)
					}
					reject(error)
				})

				stream.on('end', () => {
					if (!hasError) {
						cache.set(key, { mtime, size, tokens })
						resolve({ tokens })
					}
				})
			},
		)
	} catch (error) {
		// File doesn't exist or can't be accessed
		return {
			tokens: 0,
			skipped: {
				uri: uri.toString(),
				reason: 'error',
				message: error instanceof Error ? error.message : String(error),
			},
		}
	}
}

/**
 * Public helper for many files – throttles concurrency automatically.
 */
export async function countMany(
	uris: vscode.Uri[],
): Promise<Record<string, number>> {
	const limit = await getLimit()
	const entries = await Promise.all(
		uris.map((u) => limit(() => countTokens(u))),
	)
	return Object.fromEntries(uris.map((u, i) => [u.toString(), entries[i]]))
}

/**
 * Enhanced version that provides detailed information about skipped files
 */
export async function countManyWithInfo(uris: vscode.Uri[]): Promise<{
	tokenCounts: Record<string, number>
	skippedFiles: SkippedFileInfo[]
}> {
	const limit = await getLimit()
	const results = await Promise.all(
		uris.map((u) => limit(() => countTokensWithInfo(u))),
	)

	const tokenCounts: Record<string, number> = {}
	const skippedFiles: SkippedFileInfo[] = []

	for (let i = 0; i < uris.length; i++) {
		const uriString = uris[i].toString()
		const result = results[i]

		tokenCounts[uriString] = result.tokens

		if (result.skipped) {
			skippedFiles.push(result.skipped)
		}
	}

	return { tokenCounts, skippedFiles }
}

/**
 * Clear the token cache (useful for testing or when workspace changes)
 */
export function clearCache(): void {
	cache.clear()
}

/**
 * Get cache statistics for debugging
 */
export function getCacheStats(): {
	size: number
	entries: Array<{ path: string; mtime: number; size: number; tokens: number }>
} {
	const entries = Array.from(cache.entries()).map(([path, data]) => ({
		path,
		...data,
	}))

	return {
		size: cache.size,
		entries,
	}
}

/**
 * Export the encoder for webview consistency (optional)
 */
export async function encodeText(text: string): Promise<number> {
	const encoder = await getEncoder()
	return encoder.encode(text).length
}

import { execFile } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { promisify } from 'node:util'
import ignore from 'ignore'
import * as vscode from 'vscode'
import type { VscodeTreeItem } from '../types'

const execFileAsync = promisify(execFile)

export const MAX_TREE_DEPTH = 12
export const MAX_TREE_NODES = 25_000
export const MAX_LIST_FILES = 10_000

// Comprehensive list of binary file extensions
const BINARY_EXTENSIONS = new Set([
	'.jpg',
	'.jpeg',
	'.png',
	'.gif',
	'.bmp',
	'.tiff',
	'.tif',
	'.webp',
	'.svg',
	'.ico',
	'.heic',
	'.avif',
	'.mp4',
	'.avi',
	'.mov',
	'.mkv',
	'.wmv',
	'.flv',
	'.webm',
	'.m4v',
	'.3gp',
	'.ogv',
	'.mp3',
	'.wav',
	'.flac',
	'.aac',
	'.ogg',
	'.wma',
	'.m4a',
	'.opus',
	'.oga',
	'.zip',
	'.rar',
	'.7z',
	'.tar',
	'.gz',
	'.bz2',
	'.xz',
	'.lzma',
	'.cab',
	'.dmg',
	'.iso',
	'.exe',
	'.dll',
	'.so',
	'.dylib',
	'.app',
	'.deb',
	'.rpm',
	'.msi',
	'.pkg',
	'.pdf',
	'.doc',
	'.docx',
	'.xls',
	'.xlsx',
	'.ppt',
	'.pptx',
	'.odt',
	'.ods',
	'.odp',
	'.ttf',
	'.otf',
	'.woff',
	'.woff2',
	'.eot',
	'.bin',
	'.dat',
	'.db',
	'.sqlite',
	'.sqlite3',
	'.class',
	'.pyc',
	'.o',
	'.obj',
])

const MAGIC_NUMBERS = [
	{ signature: [0xff, 0xd8, 0xff], format: 'JPEG' },
	{ signature: [0x89, 0x50, 0x4e, 0x47], format: 'PNG' },
	{ signature: [0x47, 0x49, 0x46, 0x38], format: 'GIF' },
	{ signature: [0x25, 0x50, 0x44, 0x46], format: 'PDF' },
	{ signature: [0x50, 0x4b, 0x03, 0x04], format: 'ZIP' },
	{ signature: [0x50, 0x4b, 0x05, 0x06], format: 'ZIP (empty)' },
	{ signature: [0x7f, 0x45, 0x4c, 0x46], format: 'ELF' },
	{ signature: [0x4d, 0x5a], format: 'PE/EXE' },
	{ signature: [0xca, 0xfe, 0xba, 0xbe], format: 'Mach-O' },
]

const FOLDER_ICONS = {
	branch: 'folder',
	leaf: 'file',
	open: 'folder-opened',
}

const FILE_ICONS = {
	branch: 'file',
	leaf: 'file',
	open: 'file',
}

export interface FileTreeOptions {
	useGitignore?: boolean
	signal?: AbortSignal
}

export interface FileTreeResult {
	roots: VscodeTreeItem[]
	truncated: boolean
}

export interface TextFileReadResult {
	type: 'text' | 'binary' | 'not-file'
	content?: string
}

interface IgnoreContext {
	ign: ignore.Ignore
	userIgnore: ignore.Ignore
	rootUri: vscode.Uri
}

interface ScanBudget {
	nodesVisited: number
	truncated: boolean
}

const IGNORE_CONTEXT_CACHE_TTL_MS = 10_000
const ignoreContextCache = new Map<
	string,
	{
		expiresAt: number
		context?: IgnoreContext
		pending?: Promise<IgnoreContext>
	}
>()

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		const err = new Error('Aborted')
		err.name = 'AbortError'
		throw err
	}
}

function checkBudget(
	budget: ScanBudget,
	signal?: AbortSignal,
	depth?: number,
): boolean {
	throwIfAborted(signal)
	if (budget.truncated) return false
	if (depth !== undefined && depth > MAX_TREE_DEPTH) {
		budget.truncated = true
		return false
	}
	if (budget.nodesVisited >= MAX_TREE_NODES) {
		budget.truncated = true
		return false
	}
	return true
}

function bumpBudget(budget: ScanBudget): boolean {
	budget.nodesVisited++
	if (budget.nodesVisited >= MAX_TREE_NODES) {
		budget.truncated = true
		return false
	}
	return true
}

function checkMagicNumbers(chunk: Uint8Array): boolean {
	for (const { signature } of MAGIC_NUMBERS) {
		if (chunk.length >= signature.length) {
			let matches = true
			for (let i = 0; i < signature.length; i++) {
				if (chunk[i] !== signature[i]) {
					matches = false
					break
				}
			}
			if (matches) return true
		}
	}
	return false
}

function analyzeByteContent(chunk: Uint8Array): boolean {
	if (chunk.length === 0) return false

	let nonPrintableCount = 0
	let nullByteCount = 0

	for (const byte of chunk) {
		if (byte === 0) {
			nullByteCount++
		} else if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
			nonPrintableCount++
		} else if (byte > 126) {
			nonPrintableCount++
		}
	}

	if (nullByteCount > chunk.length * 0.01) {
		return true
	}

	if (nonPrintableCount > chunk.length * 0.3) {
		return true
	}

	return false
}

export function looksBinary(chunk: Uint8Array): boolean {
	if (checkMagicNumbers(chunk)) {
		return true
	}
	return analyzeByteContent(chunk)
}

export function hasBinaryFileExtension(uri: vscode.Uri): boolean {
	const fileName = uri.path.toLowerCase()
	const lastDot = fileName.lastIndexOf('.')
	if (lastDot === -1) return false
	return BINARY_EXTENSIONS.has(fileName.substring(lastDot))
}

export async function isBinaryFile(uri: vscode.Uri): Promise<boolean> {
	try {
		const stats = await vscode.workspace.fs.stat(uri)
		if (stats.type !== vscode.FileType.File) {
			return false
		}

		if (hasBinaryFileExtension(uri)) {
			return true
		}

		const content = await vscode.workspace.fs.readFile(uri)
		const chunk = content.slice(0, 8000)
		return looksBinary(chunk)
	} catch {
		return false
	}
}

export async function readTextFileForContext(
	uri: vscode.Uri,
): Promise<TextFileReadResult> {
	const stat = await vscode.workspace.fs.stat(uri)
	if (stat.type !== vscode.FileType.File) {
		return { type: 'not-file' }
	}

	if (hasBinaryFileExtension(uri)) {
		return { type: 'binary' }
	}

	const contentBuffer = await vscode.workspace.fs.readFile(uri)
	const chunk = contentBuffer.slice(0, 8000)
	if (looksBinary(chunk)) {
		return { type: 'binary' }
	}

	return {
		type: 'text',
		content: Buffer.from(contentBuffer).toString('utf8'),
	}
}

function resolveExcludesPath(input: string): string {
	let p = input.trim()
	if (p.startsWith('~')) {
		p = path.join(os.homedir(), p.slice(1))
	}
	p = p.replace(/\$(HOME|USERPROFILE)/g, (_m, name) => {
		const env = process.env[String(name)]
		return env ? env : _m
	})
	p = p.replace(/%([^%]+)%/g, (_m, name) => {
		const env = process.env[name]
		return env ? env : _m
	})
	if (p.length >= 2) {
		const first = p.charCodeAt(0)
		const last = p.charCodeAt(p.length - 1)
		if ((first === 34 && last === 34) || (first === 39 && last === 39)) {
			p = p.slice(1, -1)
		}
	}
	return path.resolve(p)
}

/** Loads gitignore-related rules for a workspace root (async). */
export async function loadIgnoreRulesForRoot(
	rootFsPath: string,
	useGitignore: boolean,
): Promise<string[]> {
	const allIgnoreLines: string[] = []

	if (!useGitignore) {
		return allIgnoreLines
	}

	const gitignorePath = path.join(rootFsPath, '.gitignore')
	try {
		const bytes = await vscode.workspace.fs.readFile(
			vscode.Uri.file(gitignorePath),
		)
		const content = Buffer.from(bytes).toString('utf8')
		allIgnoreLines.push(...content.split(/\r?\n/))
	} catch {
		// No .gitignore at repo root
	}

	const repoExcludePath = path.join(rootFsPath, '.git', 'info', 'exclude')
	try {
		const content = await fs.promises.readFile(repoExcludePath, 'utf8')
		allIgnoreLines.push(...content.split(/\r?\n/))
	} catch {
		// Not present
	}

	try {
		const { stdout } = await execFileAsync(
			'git',
			['config', '--get', 'core.excludesFile'],
			{
				cwd: rootFsPath,
				encoding: 'utf8',
				maxBuffer: 1024 * 1024,
			},
		)
		const excludesPath = stdout.trim()
		if (excludesPath) {
			const resolved = resolveExcludesPath(excludesPath)
			try {
				await fs.promises.access(resolved)
				const content = await fs.promises.readFile(resolved, 'utf8')
				allIgnoreLines.push(...content.split(/\r?\n/))
			} catch {
				// unreadable
			}
		}
	} catch {
		const candidates = [
			path.join(os.homedir(), '.config', 'git', 'ignore'),
			path.join(os.homedir(), '.gitignore_global'),
			path.join(os.homedir(), '.gitignore'),
		]
		for (const p of candidates) {
			try {
				await fs.promises.access(p)
				const content = await fs.promises.readFile(p, 'utf8')
				allIgnoreLines.push(...content.split(/\r?\n/))
				break
			} catch {
				// try next
			}
		}
	}

	return allIgnoreLines
}

function buildIgnoreContext(
	rootUri: vscode.Uri,
	excludedDirs: string[],
	allIgnoreLines: string[],
): IgnoreContext {
	let ign = ignore()
	if (allIgnoreLines.length > 0) {
		ign = ignore().add(allIgnoreLines)
	}
	ign.add(['.git', '.hg', '.svn'])

	const userIgnore = ignore().add(excludedDirs)
	return { ign, userIgnore, rootUri }
}

export function clearIgnoreContextCache(): void {
	ignoreContextCache.clear()
}

function getIgnoreContextCacheKey(
	rootUri: vscode.Uri,
	excludedDirs: string[],
	useGitignore: boolean,
): string {
	return JSON.stringify({
		root: rootUri.toString(),
		useGitignore,
		excludedDirs,
	})
}

function findWorkspaceFolderForUri(
	uri: vscode.Uri,
): vscode.WorkspaceFolder | undefined {
	const folders = vscode.workspace.workspaceFolders
	if (!folders) return undefined
	for (const folder of folders) {
		const root = folder.uri.fsPath
		const target = uri.fsPath
		if (target === root || target.startsWith(`${root}${path.sep}`)) {
			return folder
		}
	}
	return folders[0]
}

async function createIgnoreContextForUri(
	uri: vscode.Uri,
	excludedDirs: string[],
	options?: FileTreeOptions,
): Promise<IgnoreContext> {
	const folder = findWorkspaceFolderForUri(uri)
	if (!folder) {
		throw new Error('No workspace folder for URI')
	}
	const useGitignore = options?.useGitignore !== false
	const cacheKey = getIgnoreContextCacheKey(
		folder.uri,
		excludedDirs,
		useGitignore,
	)
	const cached = ignoreContextCache.get(cacheKey)
	if (cached?.context && cached.expiresAt > Date.now()) {
		return cached.context
	}
	if (cached?.pending) {
		return cached.pending
	}

	const pending = loadIgnoreRulesForRoot(folder.uri.fsPath, useGitignore)
		.then((lines) => buildIgnoreContext(folder.uri, excludedDirs, lines))
		.then((context) => {
			ignoreContextCache.set(cacheKey, {
				expiresAt: Date.now() + IGNORE_CONTEXT_CACHE_TTL_MS,
				context,
			})
			return context
		})
		.catch((error) => {
			ignoreContextCache.delete(cacheKey)
			throw error
		})

	ignoreContextCache.set(cacheKey, {
		expiresAt: 0,
		pending,
	})
	return pending
}

function shouldIgnorePath(
	relativePathForIgnore: string,
	ctx: IgnoreContext,
): boolean {
	return (
		ctx.ign.ignores(relativePathForIgnore) ||
		ctx.userIgnore.ignores(relativePathForIgnore)
	)
}

function sortEntries(
	entries: [string, vscode.FileType][],
): [string, vscode.FileType][] {
	return entries.sort((a, b) => {
		if (
			a[1] === vscode.FileType.Directory &&
			b[1] !== vscode.FileType.Directory
		)
			return -1
		if (
			a[1] !== vscode.FileType.Directory &&
			b[1] === vscode.FileType.Directory
		)
			return 1
		return a[0].localeCompare(b[0])
	})
}

/**
 * Shallow workspace roots (one node per workspace folder, no children loaded).
 */
export async function getWorkspaceRoots(
	_excludedDirs: string[],
	_options?: FileTreeOptions,
): Promise<FileTreeResult> {
	const workspaceFolders = vscode.workspace.workspaceFolders
	if (!workspaceFolders || workspaceFolders.length === 0) {
		vscode.window.showInformationMessage('No workspace folder open.')
		return { roots: [], truncated: false }
	}

	const roots: VscodeTreeItem[] = []
	for (const folder of workspaceFolders) {
		roots.push({
			label: folder.name,
			value: folder.uri.toString(),
			icons: FOLDER_ICONS,
		})
	}
	return { roots, truncated: false }
}

/**
 * Reads one directory level for lazy tree expansion.
 */
export async function getDirectoryChildren(
	parentUriString: string,
	excludedDirs: string[],
	options?: FileTreeOptions,
): Promise<FileTreeResult> {
	const signal = options?.signal
	throwIfAborted(signal)

	const parentUri = vscode.Uri.parse(parentUriString)
	const ctx = await createIgnoreContextForUri(parentUri, excludedDirs, options)
	const budget: ScanBudget = { nodesVisited: 0, truncated: false }

	const children = await readDirectoryOneLevel(
		parentUri,
		ctx,
		budget,
		signal,
		true,
	)
	return { roots: children, truncated: budget.truncated }
}

async function readDirectoryOneLevel(
	currentUri: vscode.Uri,
	ctx: IgnoreContext,
	budget: ScanBudget,
	signal?: AbortSignal,
	lazyFolders = false,
): Promise<VscodeTreeItem[]> {
	const items: VscodeTreeItem[] = []

	if (!checkBudget(budget, signal)) {
		return items
	}

	try {
		const entries = sortEntries(
			await vscode.workspace.fs.readDirectory(currentUri),
		)

		for (const [name, type] of entries) {
			if (!checkBudget(budget, signal)) break

			const entryUri = vscode.Uri.joinPath(currentUri, name)
			const relativePathForIgnore = path.relative(
				ctx.rootUri.fsPath,
				entryUri.fsPath,
			)

			if (shouldIgnorePath(relativePathForIgnore, ctx)) {
				continue
			}

			if (!bumpBudget(budget)) break

			const item: VscodeTreeItem = {
				label: name,
				value: entryUri.toString(),
			}

			if (type === vscode.FileType.Directory) {
				item.icons = FOLDER_ICONS
				if (!lazyFolders) {
					// subItems filled by recursive reader
				}
			} else if (type === vscode.FileType.File) {
				item.icons = FILE_ICONS
			}

			items.push(item)
		}
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		console.error(
			`Error reading directory ${currentUri.fsPath}: ${errorMessage}`,
		)
	}

	return items
}

async function readDirectoryRecursiveForRoot(
	currentUri: vscode.Uri,
	rootUri: vscode.Uri,
	ctx: IgnoreContext,
	budget: ScanBudget,
	depth: number,
	signal?: AbortSignal,
): Promise<VscodeTreeItem[]> {
	const items: VscodeTreeItem[] = []

	if (!checkBudget(budget, signal, depth)) {
		return items
	}

	try {
		const entries = sortEntries(
			await vscode.workspace.fs.readDirectory(currentUri),
		)

		for (const [name, type] of entries) {
			if (!checkBudget(budget, signal, depth)) break

			const entryUri = vscode.Uri.joinPath(currentUri, name)
			const relativePathForIgnore = path.relative(
				rootUri.fsPath,
				entryUri.fsPath,
			)

			if (shouldIgnorePath(relativePathForIgnore, ctx)) {
				continue
			}

			if (!bumpBudget(budget)) break

			const item: VscodeTreeItem = {
				label: name,
				value: entryUri.toString(),
			}

			if (type === vscode.FileType.Directory) {
				item.icons = FOLDER_ICONS
				const subItems = await readDirectoryRecursiveForRoot(
					entryUri,
					rootUri,
					ctx,
					budget,
					depth + 1,
					signal,
				)
				if (subItems.length > 0) {
					item.subItems = subItems
				}
			} else if (type === vscode.FileType.File) {
				item.icons = FILE_ICONS
			}

			items.push(item)
		}
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		console.error(
			`Error reading directory ${currentUri.fsPath}: ${errorMessage}`,
		)
	}

	return items
}

/**
 * Full recursive tree (capped). Used by tests and legacy paths.
 */
export async function getWorkspaceFileTree(
	excludedDirs: string[],
	options?: FileTreeOptions,
): Promise<FileTreeResult> {
	const workspaceFolders = vscode.workspace.workspaceFolders
	if (!workspaceFolders || workspaceFolders.length === 0) {
		vscode.window.showInformationMessage('No workspace folder open.')
		return { roots: [], truncated: false }
	}

	const signal = options?.signal
	const useGitignore = options?.useGitignore !== false
	const allRootItems: VscodeTreeItem[] = []
	const budget: ScanBudget = { nodesVisited: 0, truncated: false }

	for (const folder of workspaceFolders) {
		throwIfAborted(signal)
		if (!checkBudget(budget, signal)) break

		const rootUri = folder.uri
		const allIgnoreLines = await loadIgnoreRulesForRoot(
			rootUri.fsPath,
			useGitignore,
		)
		const ctx = buildIgnoreContext(rootUri, excludedDirs, allIgnoreLines)

		const subItems = await readDirectoryRecursiveForRoot(
			rootUri,
			rootUri,
			ctx,
			budget,
			0,
			signal,
		)

		allRootItems.push({
			label: folder.name,
			value: rootUri.toString(),
			icons: FOLDER_ICONS,
			subItems,
		})
	}

	return { roots: allRootItems, truncated: budget.truncated }
}

export interface ListFilesResult {
	uris: string[]
	truncated: boolean
}

/**
 * Lists file URIs under a folder URI (for select-all), respecting ignores and caps.
 */
export async function listFilesUnderUri(
	targetUriString: string,
	excludedDirs: string[],
	options?: FileTreeOptions,
): Promise<ListFilesResult> {
	const signal = options?.signal
	throwIfAborted(signal)

	const targetUri = vscode.Uri.parse(targetUriString)
	const stat = await vscode.workspace.fs.stat(targetUri)

	const ctx = await createIgnoreContextForUri(targetUri, excludedDirs, options)
	const uris: string[] = []
	let truncated = false

	const relativeSelf = path.relative(ctx.rootUri.fsPath, targetUri.fsPath)

	if (stat.type === vscode.FileType.File) {
		if (!shouldIgnorePath(relativeSelf, ctx)) {
			uris.push(targetUri.toString())
		}
		return { uris, truncated: false }
	}

	const queue: vscode.Uri[] = [targetUri]
	let visited = 0

	while (queue.length > 0) {
		throwIfAborted(signal)
		const currentUri = queue.shift()!
		let entries: [string, vscode.FileType][]
		try {
			entries = await vscode.workspace.fs.readDirectory(currentUri)
		} catch {
			continue
		}

		for (const [name, type] of entries) {
			throwIfAborted(signal)
			if (uris.length >= MAX_LIST_FILES) {
				truncated = true
				return { uris, truncated }
			}

			const entryUri = vscode.Uri.joinPath(currentUri, name)
			const relativePathForIgnore = path.relative(
				ctx.rootUri.fsPath,
				entryUri.fsPath,
			)

			if (shouldIgnorePath(relativePathForIgnore, ctx)) {
				continue
			}

			visited++
			if (visited > MAX_TREE_NODES) {
				truncated = true
				return { uris, truncated }
			}

			if (type === vscode.FileType.File) {
				uris.push(entryUri.toString())
			} else if (type === vscode.FileType.Directory) {
				queue.push(entryUri)
			}
		}
	}

	return { uris, truncated }
}

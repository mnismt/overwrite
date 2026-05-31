import * as assert from 'node:assert'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { after, before, describe, it } from 'mocha'
import * as vscode from 'vscode'
import {
	MAX_LIST_FILES,
	MAX_TREE_DEPTH,
	MAX_TREE_NODES,
	clearIgnoreContextCache,
	getDirectoryChildren,
	getWorkspaceRoots,
	listFilesUnderUri,
	loadIgnoreRulesForRoot,
	readTextFileForContext,
} from '../../../utils/file-system'

// Mirrors the heavy-dir defaults the provider passes (see FileExplorerProvider).
const DEFAULT_EXCLUDES = [
	'node_modules',
	'dist',
	'build',
	'.next',
	'out',
	'vendor',
	'target',
	'.turbo',
	'.cache',
	'coverage',
]

const baseDir = path.join(os.tmpdir(), 'overwrite-fs-tests')

async function writeFixture(rel: string, content = ''): Promise<void> {
	const abs = path.join(baseDir, rel)
	await fsp.mkdir(path.dirname(abs), { recursive: true })
	await fsp.writeFile(abs, content, 'utf8')
}

/**
 * Attempts to point `vscode.workspace.workspaceFolders` at a temp dir. Returns a
 * restore fn, or null if the property cannot be redefined in this VS Code build
 * (in which case the workspace-scoped tests self-skip rather than fail).
 */
function tryStubWorkspaceFolders(dir: string): (() => void) | null {
	try {
		const folders = [{ uri: vscode.Uri.file(dir), name: 'fixture', index: 0 }]
		const original = Object.getOwnPropertyDescriptor(
			vscode.workspace,
			'workspaceFolders',
		)
		Object.defineProperty(vscode.workspace, 'workspaceFolders', {
			configurable: true,
			get: () => folders,
		})
		if (
			vscode.workspace.workspaceFolders?.[0]?.uri.fsPath !==
			vscode.Uri.file(dir).fsPath
		) {
			throw new Error('workspaceFolders stub did not take effect')
		}
		return () => {
			if (original) {
				Object.defineProperty(vscode.workspace, 'workspaceFolders', original)
			}
		}
	} catch {
		return null
	}
}

describe('file-system: constants', () => {
	it('exports sane scan limits', () => {
		assert.ok(MAX_TREE_DEPTH >= 1)
		assert.ok(MAX_TREE_NODES >= 1000)
		assert.ok(MAX_LIST_FILES >= 1000)
		assert.ok(MAX_LIST_FILES <= MAX_TREE_NODES)
	})
})

describe('file-system: loadIgnoreRulesForRoot', () => {
	before(async () => {
		await fsp.rm(baseDir, { recursive: true, force: true })
		await fsp.mkdir(baseDir, { recursive: true })
		await writeFixture('.gitignore', 'ignored\n*.log\n')
	})
	after(async () => {
		await fsp.rm(baseDir, { recursive: true, force: true })
	})

	it('reads .gitignore lines when gitignore is enabled', async () => {
		const lines = await loadIgnoreRulesForRoot(baseDir, true)
		assert.ok(lines.includes('ignored'))
		assert.ok(lines.includes('*.log'))
	})

	it('returns no rules when gitignore is disabled', async () => {
		const lines = await loadIgnoreRulesForRoot(baseDir, false)
		assert.deepStrictEqual(lines, [])
	})
})

describe('file-system: readTextFileForContext', () => {
	before(async () => {
		await fsp.rm(baseDir, { recursive: true, force: true })
		await fsp.mkdir(baseDir, { recursive: true })
		await writeFixture('plain.txt', 'hello')
		await writeFixture('image.png', 'not actually png, but extension is binary')
		await fsp.mkdir(path.join(baseDir, 'folder'), { recursive: true })
	})
	after(async () => {
		await fsp.rm(baseDir, { recursive: true, force: true })
	})

	it('reads text files', async () => {
		const result = await readTextFileForContext(
			vscode.Uri.file(path.join(baseDir, 'plain.txt')),
		)
		assert.strictEqual(result.type, 'text')
		assert.strictEqual(result.content, 'hello')
	})

	it('skips known binary extensions before reading content as text', async () => {
		const result = await readTextFileForContext(
			vscode.Uri.file(path.join(baseDir, 'image.png')),
		)
		assert.strictEqual(result.type, 'binary')
	})

	it('reports directories as not-file', async () => {
		const result = await readTextFileForContext(
			vscode.Uri.file(path.join(baseDir, 'folder')),
		)
		assert.strictEqual(result.type, 'not-file')
	})
})

describe('file-system: abort handling (no workspace required)', () => {
	it('getDirectoryChildren rejects when the signal is already aborted', async () => {
		const controller = new AbortController()
		controller.abort()
		await assert.rejects(
			() =>
				getDirectoryChildren('file:///anything', DEFAULT_EXCLUDES, {
					signal: controller.signal,
				}),
			/Aborted/,
		)
	})

	it('listFilesUnderUri rejects when the signal is already aborted', async () => {
		const controller = new AbortController()
		controller.abort()
		await assert.rejects(
			() =>
				listFilesUnderUri('file:///anything', DEFAULT_EXCLUDES, {
					signal: controller.signal,
				}),
			/Aborted/,
		)
	})
})

describe('file-system: lazy tree APIs (workspace-scoped)', () => {
	let restore: (() => void) | null = null

	before(async function () {
		clearIgnoreContextCache()
		await fsp.rm(baseDir, { recursive: true, force: true })
		await fsp.mkdir(baseDir, { recursive: true })
		await writeFixture('src/app.ts', 'export const a = 1')
		await writeFixture('src/util.ts', 'export const u = 2')
		await writeFixture('keep.ts', 'keep')
		await writeFixture('node_modules/dep/index.js', 'dep')
		await writeFixture('dist/out.js', 'out')
		await writeFixture('.gitignore', 'ignored\n')
		await writeFixture('ignored/secret.ts', 'secret')

		restore = tryStubWorkspaceFolders(baseDir)
		if (!restore) {
			this.skip()
		}
	})

	after(async () => {
		restore?.()
		clearIgnoreContextCache()
		await fsp.rm(baseDir, { recursive: true, force: true })
	})

	it('getWorkspaceRoots returns one shallow root per workspace folder', async () => {
		const { roots, truncated } = await getWorkspaceRoots(DEFAULT_EXCLUDES)
		assert.strictEqual(truncated, false)
		assert.strictEqual(roots.length, 1)
		assert.strictEqual(roots[0]?.value, vscode.Uri.file(baseDir).toString())
		// Shallow: roots carry no children until expanded.
		assert.strictEqual(roots[0]?.subItems, undefined)
	})

	it('getDirectoryChildren applies default excludes and .gitignore', async () => {
		const parent = vscode.Uri.file(baseDir).toString()
		const { roots: children } = await getDirectoryChildren(
			parent,
			DEFAULT_EXCLUDES,
		)
		const labels = children.map((c) => c.label)

		assert.ok(labels.includes('src'), 'src present')
		assert.ok(labels.includes('keep.ts'), 'keep.ts present')
		assert.ok(!labels.includes('node_modules'), 'node_modules excluded')
		assert.ok(!labels.includes('dist'), 'dist excluded')
		assert.ok(!labels.includes('ignored'), 'gitignored dir excluded')

		// Folder children are returned shallow (no nested subItems).
		const src = children.find((c) => c.label === 'src')
		assert.ok(src)
		assert.strictEqual(src?.subItems, undefined)
	})

	it('listFilesUnderUri returns files excluding heavy and gitignored dirs', async () => {
		const target = vscode.Uri.file(baseDir).toString()
		const { uris, truncated } = await listFilesUnderUri(
			target,
			DEFAULT_EXCLUDES,
		)
		assert.strictEqual(truncated, false)

		const rel = uris.map((u) =>
			path.relative(baseDir, vscode.Uri.parse(u).fsPath),
		)

		assert.ok(rel.includes('keep.ts'))
		assert.ok(rel.includes(path.join('src', 'app.ts')))
		assert.ok(rel.includes(path.join('src', 'util.ts')))
		assert.ok(
			!rel.some((r) => r.startsWith(`node_modules${path.sep}`)),
			'no node_modules files',
		)
		assert.ok(
			!rel.some((r) => r.startsWith(`dist${path.sep}`)),
			'no dist files',
		)
		assert.ok(
			!rel.some((r) => r.startsWith(`ignored${path.sep}`)),
			'no gitignored files',
		)
	})

	it('clearIgnoreContextCache lets callers pick up changed ignore rules', async () => {
		await writeFixture('.gitignore', '')
		clearIgnoreContextCache()

		const parent = vscode.Uri.file(baseDir).toString()
		const { roots: children } = await getDirectoryChildren(
			parent,
			DEFAULT_EXCLUDES,
		)
		const labels = children.map((c) => c.label)

		assert.ok(labels.includes('ignored'), 'updated gitignore rules applied')
	})
})

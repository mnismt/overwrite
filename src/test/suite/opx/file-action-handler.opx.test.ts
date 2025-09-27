import * as assert from 'node:assert'
import * as os from 'node:os'
import * as path from 'node:path'
import { after, before, describe, it } from 'mocha'
import * as vscode from 'vscode'
import { applyFileActions } from '../../../providers/file-explorer/file-action-handler'
import { parseXmlResponse } from '../../../utils/xml-parser'

const baseDir = path.join(os.tmpdir(), 'overwrite-opx-tests')

async function writeFile(absRel: string, content: string): Promise<vscode.Uri> {
	const abs = path.isAbsolute(absRel) ? absRel : path.join(baseDir, absRel)
	const uri = vscode.Uri.file(abs)
	await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(abs)))
	await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'))
	return uri
}

async function readFile(absRel: string): Promise<string> {
	const abs = path.isAbsolute(absRel) ? absRel : path.join(baseDir, absRel)
	const uri = vscode.Uri.file(abs)
	const buf = await vscode.workspace.fs.readFile(uri)
	return Buffer.from(buf).toString('utf8')
}

async function removePath(absRel: string): Promise<void> {
	const abs = path.isAbsolute(absRel) ? absRel : path.join(baseDir, absRel)
	const uri = vscode.Uri.file(abs)
	try {
		await vscode.workspace.fs.delete(uri, { recursive: true })
	} catch {}
}

describe('applyFileActions with OPX', () => {
	before(async () => {
		await vscode.workspace.fs.createDirectory(vscode.Uri.file(baseDir))
	})

	after(async () => {
		await removePath(baseDir)
	})

	it('creates a file (op=new)', async () => {
		const target = path.join(baseDir, 'newfile.ts')
		const xml = `
<edit file="${target}" op="new">
  <put>
<<<
export const HELLO = 'world';
>>>
  </put>
</edit>`
		const { fileActions, errors } = parseXmlResponse(xml)
		assert.deepStrictEqual(errors, [])

		const results = await applyFileActions(fileActions)
		assert.strictEqual(results[0]?.success, true)
		const text = await readFile(target)
		assert.ok(text.includes("HELLO = 'world'"))
	})

	it('patches a CRLF document with LF search and occurrence=last', async () => {
		const target = path.join(baseDir, 'crlf.ts')
		await writeFile(target, 'a\r\nconst x = 1;\r\nconst x = 1;\r\nz\r\n')

		const xml = `
<edit file="${target}" op="patch">
  <find occurrence="last">
<<<
const x = 1;
>>>
  </find>
  <put>
<<<
const x = 2;
>>>
  </put>
</edit>`
		const { fileActions, errors } = parseXmlResponse(xml)
		assert.deepStrictEqual(errors, [])

		const results = await applyFileActions(fileActions)
		assert.strictEqual(results[0]?.success, true)

		const text = await readFile(target)
		assert.ok(text.includes('const x = 2;'))
		// Ensure first occurrence still present
		assert.ok(text.indexOf('const x = 2;') > text.indexOf('const x = 1;'))
	})

	it('renames a file (op=move)', async () => {
		const from = path.join(baseDir, 'move-from.ts')
		const to = path.join(baseDir, 'move-to.ts')
		await writeFile(from, 'A')

		const xml = `
<edit file="${from}" op="move">
  <to file="${to}" />
</edit>`
		const { fileActions, errors } = parseXmlResponse(xml)
		assert.deepStrictEqual(errors, [])
		const results = await applyFileActions(fileActions)
		assert.strictEqual(results[0]?.success, true)

		const text = await readFile(to)
		assert.strictEqual(text, 'A')
	})

	it('deletes a file (op=remove)', async () => {
		const target = path.join(baseDir, 'del.ts')
		await writeFile(target, 'DEL')

		const xml = `<edit file="${target}" op="remove" />`
		const { fileActions, errors } = parseXmlResponse(xml)
		assert.deepStrictEqual(errors, [])
		const results = await applyFileActions(fileActions)
		assert.strictEqual(results[0]?.success, true)

		let exists = true
		try {
			await readFile(target)
		} catch {
			exists = false
		}
		assert.strictEqual(exists, false)
	})

	it('rewrite fails when file does not exist', async () => {
		const target = path.join(baseDir, 'nope.ts')
		const xml = `
<edit file="${target}" op="replace">
  <put>
<<<
A
>>>
  </put>
</edit>`
		const { fileActions, errors } = parseXmlResponse(xml)
		assert.deepStrictEqual(errors, [])
		const results = await applyFileActions(fileActions)
		assert.strictEqual(results[0]?.success, false)
		assert.match(results[0]!.message, /does not exist|cannot rewrite/i)
	})
})

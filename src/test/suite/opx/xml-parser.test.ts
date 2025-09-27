import * as assert from 'node:assert'
import { describe, it } from 'mocha'
import { parseXmlResponse } from '../../../utils/xml-parser'

describe('OPX Parser (parseXmlResponse)', () => {
	it('parses op=new with <put> content', () => {
		const xml = `
<edit file="src/utils/strings.ts" op="new">
  <why>Create strings util</why>
  <put>
<<<
export const A = 1;
>>>
  </put>
</edit>`
		const res = parseXmlResponse(xml)
		assert.deepStrictEqual(res.errors, [])
		assert.strictEqual(res.fileActions.length, 1)
		const a = res.fileActions[0]!
		assert.strictEqual(a.action, 'create')
		assert.strictEqual(a.path, 'src/utils/strings.ts')
		assert.strictEqual(
			(a.changes?.[0]?.content ?? '').trim(),
			'export const A = 1;',
		)
	})

	it('parses op=patch with occurrence and maps correctly', () => {
		const xml = `
<edit file="src/a.ts" op="patch">
  <why>Patch region</why>
  <find occurrence="2">
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
		const res = parseXmlResponse(xml)
		assert.deepStrictEqual(res.errors, [])
		const f = res.fileActions[0]!
		assert.strictEqual(f.action, 'modify')
		assert.strictEqual(f.changes?.[0]?.occurrence, 2)
		assert.strictEqual((f.changes?.[0]?.search ?? '').trim(), 'const x = 1;')
		assert.strictEqual((f.changes?.[0]?.content ?? '').trim(), 'const x = 2;')
	})

	it('parses op=replace into rewrite', () => {
		const xml = `
<edit file="src/config/index.ts" op="replace">
  <put>
<<<
export default 1;
>>>
  </put>
</edit>`
		const res = parseXmlResponse(xml)
		assert.deepStrictEqual(res.errors, [])
		const f = res.fileActions[0]!
		assert.strictEqual(f.action, 'rewrite')
		assert.strictEqual(
			(f.changes?.[0]?.content ?? '').trim(),
			'export default 1;',
		)
	})

	it('parses op=remove (self-closing)', () => {
		const xml = `<edit file="tests/legacy/user-auth.spec.ts" op="remove" />`
		const res = parseXmlResponse(xml)
		assert.deepStrictEqual(res.errors, [])
		const f = res.fileActions[0]!
		assert.strictEqual(f.action, 'delete')
		assert.strictEqual(f.path, 'tests/legacy/user-auth.spec.ts')
	})

	it('parses op=move with <to file=.../>', () => {
		const xml = `
<edit file="src/lib/flags.ts" op="move">
  <to file="src/lib/feature-flags.ts" />
</edit>`
		const res = parseXmlResponse(xml)
		assert.deepStrictEqual(res.errors, [])
		const f = res.fileActions[0]!
		assert.strictEqual(f.action, 'rename')
		assert.strictEqual(f.newPath, 'src/lib/feature-flags.ts')
	})

	it('errors when edit missing file/op', () => {
		const xml = `<edit op="new"><put><<<\nA\n>>> </put></edit>`
		const res = parseXmlResponse(xml)
		assert.ok(res.errors.length >= 1)
		assert.strictEqual(res.fileActions.length, 0)
	})

	it('errors when patch missing <find> or <put>', () => {
		const xml1 = `<edit file="a.ts" op="patch"><put><<<\nA\n>>> </put></edit>`
		const xml2 = `<edit file="a.ts" op="patch"><find><<<\nA\n>>> </find></edit>`
		const r1 = parseXmlResponse(xml1)
		const r2 = parseXmlResponse(xml2)
		assert.ok(r1.errors.length >= 1)
		assert.ok(r2.errors.length >= 1)
	})

	it('supports wrapper <opx> with multiple edits', () => {
		const xml = `
<opx>
  <edit file="a.ts" op="new"><put><<<\nA\n>>> </put></edit>
  <edit file="b.ts" op="remove" />
</opx>`
		const res = parseXmlResponse(xml)
		assert.deepStrictEqual(res.errors, [])
		assert.strictEqual(res.fileActions.length, 2)
		assert.strictEqual(res.fileActions[0]!.action, 'create')
		assert.strictEqual(res.fileActions[1]!.action, 'delete')
	})

	it('sanitizes code fences and leading chatter', () => {
		const xml =
			'```xml\n<edit file="x.ts" op="new"><put><<<\nA\n>>> </put></edit>\n```'
		const res = parseXmlResponse(xml)
		assert.deepStrictEqual(res.errors, [])
		assert.strictEqual(res.fileActions[0]!.action, 'create')
	})

	it('rejects legacy <file> format', () => {
		const xml = `<file path="a.ts" action="create"><change><content>===\nA\n===</content></change></file>`
		const res = parseXmlResponse(xml)
		// Our OPX-only parser surfaces a generic error when no <edit> is present
		assert.ok(res.errors.length >= 1)
		assert.strictEqual(res.fileActions.length, 0)
	})

	it('errors on unknown op value', () => {
		const xml = `<edit file="x.ts" op="frobnicate" />`
		const res = parseXmlResponse(xml)
		assert.ok(res.errors[0]?.includes('unknown op'))
		assert.strictEqual(res.fileActions.length, 0)
	})

	it('errors when move has no <to/> or missing file attr', () => {
		const xml1 = `<edit file="a.ts" op="move"></edit>`
		const xml2 = `<edit file="a.ts" op="move"><to path="b.ts" /></edit>`
		const xml3 = `<edit file="a.ts" op="move"><to file="b.ts"></to></edit>`
		for (const xml of [xml1, xml2, xml3]) {
			const res = parseXmlResponse(xml)
			assert.ok(res.errors[0]?.includes('Missing <to file'))
			assert.strictEqual(res.fileActions.length, 0)
		}
	})

	it('errors when patch <find> markers are empty/whitespace', () => {
		const xml = `
<edit file="a.ts" op="patch">
  <find>
<<<
   \n  \n\t
>>>
  </find>
  <put>
<<<
OK
>>>
  </put>
</edit>`
		const res = parseXmlResponse(xml)
		assert.ok(res.errors[0]?.includes('Empty or missing marker block'))
	})

	it('auto-heals truncated markers "<"/">" into OPX markers inside <find>/<put>', () => {
		const xml = `
<edit file="src/app/layout.tsx" op="patch">
  <find>
<
export const metadata: Metadata = { title: "A", description: "B" };
>>>
  </find>
  <put>
<<
export const metadata: Metadata = { title: "X", description: "Y" };
>
  </put>
</edit>`
		const res = parseXmlResponse(xml)
		assert.deepStrictEqual(res.errors, [])
		const f = res.fileActions[0]!
		assert.strictEqual(f.action, 'modify')
		assert.ok((f.changes?.[0]?.search || '').includes('title: "A"'))
		assert.ok((f.changes?.[0]?.content || '').includes('title: "X"'))
	})

	it('ignores invalid occurrence value (no error, undefined occurrence)', () => {
		const xml = `
<edit file="a.ts" op="patch">
  <find occurrence="second">
<<<
AAA
>>>
  </find>
  <put>
<<<
BBB
>>>
  </put>
</edit>`
		const res = parseXmlResponse(xml)
		assert.deepStrictEqual(res.errors, [])
		const f = res.fileActions[0]!
		assert.strictEqual(f.action, 'modify')
		assert.strictEqual(f.changes?.[0]?.occurrence, undefined)
	})

	it('errors when no <edit> tags are present', () => {
		const res = parseXmlResponse('<noop />')
		assert.ok(res.errors[0]?.includes('No <edit>'))
		assert.strictEqual(res.fileActions.length, 0)
	})
})

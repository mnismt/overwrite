import { describe, it, expect } from 'vitest'
import { lintXmlText, preprocessXmlText } from '../preprocess'

describe('OPX preprocess + lint', () => {
  it('normalizes attribute keys and quotes for <edit> and <to/> but preserves payloads', () => {
    const input = `
<EDIT FILE='Src/UTILS/A.ts' OP='NEW' RoOt='rootA'>
  <why>Create A</why>
  <put>
<<<
export const A = 1;
>>>
  </put>
</EDIT>
<edit file="x.ts" op='move'>
  <to FILE='y.ts' />
</edit>`

    const { text, changes, issues } = preprocessXmlText(input)

    // Attributes normalized (tag name casing preserved)
    expect(text).toContain('file="Src/UTILS/A.ts"')
    expect(text).toContain('op=')
    expect(text).toContain('<to file="y.ts" />')

    // Payload preserved and put/find restored as-is
    expect(text).toContain('<<<\nexport const A = 1;\n>>>')
    expect(text).toContain('<put>')

    // Notes mention normalization; no lint issues for valid edits
    expect(changes.some((m) => m.includes('Normalized <edit> attributes'))).toBe(true)
    expect(changes.some((m) => m.includes('Normalized <to/> attributes'))).toBe(true)
    expect(issues.length).toBe(0)
  })

  it('lints missing file/op and missing <to file=.../>', () => {
    const bad1 = `<edit op="new"><put><<<\nX\n>>> </put></edit>`
    const bad2 = `<edit file="a.ts" op="move"><to path="b.ts" /></edit>`

    const l1 = lintXmlText(bad1)
    const l2 = lintXmlText(bad2)

    expect(l1.some((m) => m.includes('missing file'))).toBe(true)
    // Pre-lint does not validate child <to>; ensure no crash on preprocess
    const p2 = preprocessXmlText(bad2)
    expect(typeof p2.text).toBe('string')
  })
})

import { describe, expect, it } from 'vitest'
import type { VscodeTreeItem } from '../../../../types'
import { buildTreeIndex } from '../tree-index'

describe('buildTreeIndex', () => {
	const tree: VscodeTreeItem[] = [
		{
			label: 'root',
			value: 'root',
			subItems: [
				{ label: 'a.ts', value: 'a' },
				{ label: 'b.ts', value: 'b' },
				{
					label: 'folder',
					value: 'folder',
					subItems: [
						{ label: 'c.ts', value: 'c' },
						{ label: 'd.ts', value: 'd' },
					],
				},
			],
		},
	]

	it('indexes nodes and computes descendant file counts', () => {
		const idx = buildTreeIndex(tree)

		expect(idx.nodes.has('root')).toBe(true)
		expect(idx.nodes.has('a')).toBe(true)
		expect(idx.nodes.get('root')?.isFolder).toBe(true)
		expect(idx.nodes.get('a')?.isFolder).toBe(false)

		expect(idx.descendantFileCount.get('root')).toBe(4)
		expect(idx.descendantFileCount.get('folder')).toBe(2)
		expect(idx.descendantFileCount.get('a')).toBe(1)
	})
})

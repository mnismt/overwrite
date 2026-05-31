import { describe, expect, it } from 'vitest'
import type { VscodeTreeItem } from '../../../../types'
import { buildTreeIndex } from '../tree-index'

const folderIcons = {
	branch: 'folder',
	open: 'folder-opened',
	leaf: 'file',
} as const
const fileIcons = { branch: 'file', open: 'file', leaf: 'file' } as const

describe('buildTreeIndex', () => {
	const tree: VscodeTreeItem[] = [
		{
			label: 'root',
			value: 'root',
			icons: folderIcons,
			subItems: [
				{ label: 'a.ts', value: 'a', icons: fileIcons },
				{ label: 'b.ts', value: 'b', icons: fileIcons },
				{
					label: 'folder',
					value: 'folder',
					icons: folderIcons,
					subItems: [
						{ label: 'c.ts', value: 'c', icons: fileIcons },
						{ label: 'd.ts', value: 'd', icons: fileIcons },
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

	it('handles lazily-loaded folders without subItems', () => {
		// Shallow roots from getWorkspaceRoots(): folder icons, no subItems.
		const shallow: VscodeTreeItem[] = [
			{ label: 'rootA', value: 'file:///root-a', icons: folderIcons },
			{ label: 'rootB', value: 'file:///root-b', icons: folderIcons },
		]

		const idx = buildTreeIndex(shallow)

		expect(idx.nodes.get('file:///root-a')?.isFolder).toBe(true)
		expect(idx.nodes.get('file:///root-a')?.children).toEqual([])
		// Unloaded folders contribute 0 files until their children are fetched.
		expect(idx.descendantFileCount.get('file:///root-a')).toBe(0)
		expect(idx.descendantFileCount.get('file:///root-b')).toBe(0)
	})
})

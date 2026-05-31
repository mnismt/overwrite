import { describe, expect, it } from 'vitest'
import type { VscodeTreeItem } from '../../../../types'
import { folderNeedsLoad, isFolderItem, mergeChildren } from '../tree-merge'

describe('tree-merge', () => {
	const tree: VscodeTreeItem[] = [
		{
			label: 'root',
			value: 'root',
			icons: { branch: 'folder', open: 'folder-opened', leaf: 'file' },
		},
	]

	it('mergeChildren attaches children to the matching parent', () => {
		const children: VscodeTreeItem[] = [
			{
				label: 'child.ts',
				value: 'child',
				icons: { branch: 'file', open: 'file', leaf: 'file' },
			},
		]
		const merged = mergeChildren(tree, 'root', children)
		expect(merged[0]?.subItems).toHaveLength(1)
		expect(merged[0]?.subItems?.[0]?.value).toBe('child')
	})

	it('isFolderItem and folderNeedsLoad detect lazy folders', () => {
		const folder: VscodeTreeItem = {
			label: 'f',
			value: 'f',
			icons: { branch: 'folder', open: 'folder-opened', leaf: 'file' },
		}
		expect(isFolderItem(folder)).toBe(true)
		expect(folderNeedsLoad(folder)).toBe(true)

		const loaded: VscodeTreeItem = { ...folder, subItems: [] }
		expect(folderNeedsLoad(loaded)).toBe(false)
	})
})

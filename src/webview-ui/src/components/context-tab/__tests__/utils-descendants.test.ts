import { describe, expect, it } from 'vitest'
import type { VscodeTreeItem } from '../../../types'
import { getAllDescendantPaths } from '../utils'

describe('getAllDescendantPaths', () => {
	it('collects all descendant URIs iteratively without stack overflow', () => {
		let leaf: VscodeTreeItem = {
			label: 'deep',
			value: 'deep',
			icons: { branch: 'file', open: 'file', leaf: 'file' },
		}
		for (let i = 0; i < 200; i++) {
			leaf = {
				label: `d${i}`,
				value: `d${i}`,
				icons: { branch: 'folder', open: 'folder-opened', leaf: 'file' },
				subItems: [leaf],
			}
		}

		const paths = getAllDescendantPaths(leaf)
		expect(paths.length).toBe(201)
		expect(paths[0]).toBe(leaf.value)
	})
})

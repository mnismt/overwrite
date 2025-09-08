import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { VscodeTreeItem } from '../../../../../../types'

// Mock RowActions to expose simple buttons that call the provided callbacks
vi.mock('../row-actions', () => ({
	default: ({
		isFolder,
		onSelectAllInSubtree,
		onDeselectAllInSubtree,
		onToggleFile,
	}: {
		isFolder: boolean
		onSelectAllInSubtree: () => void
		onDeselectAllInSubtree: () => void
		onToggleFile: () => void
	}) => (
		<div>
			{isFolder ? (
				<>
					<button
						aria-label="mock-select-all"
						onMouseDown={() => onSelectAllInSubtree?.()}
					>
						sel
					</button>
					<button
						aria-label="mock-deselect-all"
						onMouseDown={() => onDeselectAllInSubtree?.()}
					>
						desel
					</button>
				</>
			) : (
				<button aria-label="mock-toggle" onMouseDown={() => onToggleFile?.()}>
					toggle
				</button>
			)}
		</div>
	),
}))

// Mock RowDecorations to avoid DOM details
vi.mock('../row-decorations', () => ({
	default: () => <div data-testid="decor" />,
}))

import TreeNode from '../tree-node'

describe('TreeNode', () => {
	const folder: VscodeTreeItem = {
		label: 'src',
		value: 'src',
		subItems: [{ label: 'a.ts', value: 'a' }],
	}
	const file: VscodeTreeItem = { label: 'a.ts', value: 'a' }

	it('renders folder label and exposes actions to callbacks', () => {
		const onSelectAll = vi.fn()
		const onDeselectAll = vi.fn()
		const onToggleFile = vi.fn()

		render(
			<TreeNode
				item={folder}
				depth={0}
				isFolder
				isOpen
				totalDescendantFiles={1}
				selectedDescendantFiles={0}
				folderSelectionState="none"
				folderTokenTotal={0}
				fileIsSelected={false}
				fileTokenCount={0}
				onToggleFile={onToggleFile}
				onSelectAllInSubtree={onSelectAll}
				onDeselectAllInSubtree={onDeselectAll}
				renderChildren={() => null}
			/>,
		)

		expect(screen.getByText('src')).toBeInTheDocument()

		fireEvent.mouseDown(screen.getByLabelText('mock-select-all'))
		expect(onSelectAll).toHaveBeenCalledTimes(1)

		fireEvent.mouseDown(screen.getByLabelText('mock-deselect-all'))
		expect(onDeselectAll).toHaveBeenCalledTimes(1)
	})

	it('renders file label and exposes toggle to callback', () => {
		const onToggleFile = vi.fn()

		render(
			<TreeNode
				item={file}
				depth={1}
				isFolder={false}
				isOpen
				totalDescendantFiles={0}
				selectedDescendantFiles={0}
				folderSelectionState="none"
				folderTokenTotal={0}
				fileIsSelected={false}
				fileTokenCount={0}
				onToggleFile={onToggleFile}
				onSelectAllInSubtree={() => {}}
				onDeselectAllInSubtree={() => {}}
				renderChildren={() => null}
			/>,
		)

		expect(screen.getByText('a.ts')).toBeInTheDocument()

		fireEvent.mouseDown(screen.getByLabelText('mock-toggle'))
		expect(onToggleFile).toHaveBeenCalledTimes(1)
	})
})

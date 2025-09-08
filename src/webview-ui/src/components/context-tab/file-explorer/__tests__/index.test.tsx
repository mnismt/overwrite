import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { VscodeTreeItem } from '../../../../../../types'

// Mock RowActions to provide simple buttons to trigger FileExplorer callbacks
vi.mock('../row-actions', () => ({
	default: ({
		isFolder,
		onSelectAllInSubtree,
		onDeselectAllInSubtree,
		onToggleFile,
		fileIsSelected,
	}: {
		isFolder: boolean
		onSelectAllInSubtree: () => void
		onDeselectAllInSubtree: () => void
		onToggleFile: () => void
		fileIsSelected: boolean
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
				<button
					aria-label={fileIsSelected ? 'mock-deselect' : 'mock-select'}
					onMouseDown={() => onToggleFile?.()}
				>
					{fileIsSelected ? 'desel' : 'sel'}
				</button>
			)}
		</div>
	),
}))

// Mock RowDecorations to avoid DOM details
vi.mock('../row-decorations', () => ({
	default: () => <div data-testid="decor" />,
}))

import FileExplorer from '../index'

const mkTree = (): VscodeTreeItem[] => [
	{
		label: 'workspace',
		value: 'ws',
		subItems: [
			{
				label: 'src',
				value: 'src',
				subItems: [
					{ label: 'a.ts', value: 'a' },
					{ label: 'b.ts', value: 'b' },
				],
			},
			{ label: 'README.md', value: 'r' },
		],
	},
]

describe('FileExplorer (index.tsx)', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})
	afterEach(() => {
		vi.runOnlyPendingTimers()
		vi.useRealTimers()
	})

	it('renders tree labels', () => {
		render(
			<FileExplorer
				fileTreeData={mkTree()}
				selectedUris={new Set()}
				onSelect={() => {}}
				isLoading={false}
				searchQuery=""
				actualTokenCounts={{}}
			/>,
		)

		expect(screen.getByText('workspace')).toBeInTheDocument()
		expect(screen.getByText('src')).toBeInTheDocument()
		expect(screen.getByText('README.md')).toBeInTheDocument()
	})

	it('selects all in a folder via RowActions mock and updates selection', async () => {
		const onSelect = vi.fn()

		render(
			<FileExplorer
				fileTreeData={mkTree()}
				selectedUris={new Set()}
				onSelect={onSelect}
				isLoading={false}
				searchQuery=""
				actualTokenCounts={{}}
			/>,
		)

		// Scope the click to the tree item that contains the 'src' label
		const srcLabel = screen.getByText('src') as HTMLElement
		const treeItem = srcLabel.closest('vscode-tree-item') as HTMLElement
		const utils = within(treeItem)

		fireEvent.mouseDown(utils.getByLabelText('mock-select-all'))
		await vi.runAllTimersAsync()

		// Expect selection contains all file leaves under the src folder only
		const selected = onSelect.mock.calls[0][0] as Set<string>
		expect(selected.has('a')).toBe(true)
		expect(selected.has('b')).toBe(true)
		expect(selected.has('r')).toBe(false)
	})

	it('deselects all in a folder via RowActions mock and updates selection', async () => {
		const onSelect = vi.fn()
		const initial = new Set<string>(['a', 'b', 'r'])

		render(
			<FileExplorer
				fileTreeData={mkTree()}
				selectedUris={initial}
				onSelect={onSelect}
				isLoading={false}
				searchQuery=""
				actualTokenCounts={{}}
			/>,
		)

		const srcLabel = screen.getByText('src') as HTMLElement
		const treeItem = srcLabel.closest('vscode-tree-item') as HTMLElement
		const utils = within(treeItem)

		fireEvent.mouseDown(utils.getByLabelText('mock-deselect-all'))
		await vi.runAllTimersAsync()

		const selected = onSelect.mock.calls[0][0] as Set<string>
		expect(selected.has('a')).toBe(false)
		expect(selected.has('b')).toBe(false)
		expect(selected.has('r')).toBe(true)
	})

	it('toggles a single file selection via RowActions mock', () => {
		const onSelect = vi.fn()

		render(
			<FileExplorer
				fileTreeData={mkTree()}
				selectedUris={new Set()}
				onSelect={onSelect}
				isLoading={false}
				searchQuery=""
				actualTokenCounts={{}}
			/>,
		)

		// README.md is a file at root; its RowActions mock will render a toggle button
		const toggleButtons = screen.getAllByRole('button', {
			name: /mock-select|mock-deselect/,
		})
		// The second file is README.md (depending on tree order); find by text if necessary
		const readmeLabel = screen.getByText('README.md')
		expect(readmeLabel).toBeInTheDocument()

		// Click the last toggle button (likely README.md)
		fireEvent.mouseDown(toggleButtons[toggleButtons.length - 1])

		const selected = onSelect.mock.calls[0][0] as Set<string>
		expect(selected.size).toBe(1)
	})
})

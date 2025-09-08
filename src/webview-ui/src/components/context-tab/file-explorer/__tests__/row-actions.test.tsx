import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RowActions from '../row-actions'

function Parent({
	children,
	onParentClick,
	onParentMouseDown,
}: {
	children: React.ReactNode
	onParentClick: () => void
	onParentMouseDown?: () => void
}) {
	return (
		<div
			data-testid="parent"
			onClick={onParentClick}
			onDoubleClick={onParentClick}
			onMouseDown={onParentMouseDown}
		>
			{children}
		</div>
	)
}

describe('RowActions', () => {
	it('folder (none selected): Select all triggers callback once and does not bubble', () => {
		const onSelectAll = vi.fn()
		const onDeselectAll = vi.fn()
		const onToggleFile = vi.fn()
		const onParentClick = vi.fn()
		const onParentMouseDown = vi.fn()

		render(
			<Parent
				onParentClick={onParentClick}
				onParentMouseDown={onParentMouseDown}
			>
				<RowActions
					isFolder
					totalDescendantFiles={2}
					selectedDescendantFiles={0}
					onSelectAllInSubtree={onSelectAll}
					onDeselectAllInSubtree={onDeselectAll}
					onToggleFile={onToggleFile}
				/>
			</Parent>,
		)

		const btn = screen.getByRole('button', { name: 'Select all' })
		fireEvent.mouseDown(btn)
		fireEvent.click(btn)

		expect(onSelectAll).toHaveBeenCalledTimes(1)
		expect(onDeselectAll).not.toHaveBeenCalled()
		expect(onToggleFile).not.toHaveBeenCalled()
		expect(onParentMouseDown).not.toHaveBeenCalled()
		expect(onParentClick).not.toHaveBeenCalled()
	})

	it('folder (partial selected): Deselect all triggers callback once and does not bubble', () => {
		const onSelectAll = vi.fn()
		const onDeselectAll = vi.fn()
		const onParentClick = vi.fn()
		const onParentMouseDown = vi.fn()

		render(
			<Parent
				onParentClick={onParentClick}
				onParentMouseDown={onParentMouseDown}
			>
				<RowActions
					isFolder
					totalDescendantFiles={3}
					selectedDescendantFiles={1}
					onSelectAllInSubtree={onSelectAll}
					onDeselectAllInSubtree={onDeselectAll}
				/>
			</Parent>,
		)

		const btn = screen.getByRole('button', { name: 'Deselect all' })
		fireEvent.mouseDown(btn)
		fireEvent.click(btn)

		expect(onDeselectAll).toHaveBeenCalledTimes(1)
		expect(onSelectAll).not.toHaveBeenCalled()
		expect(onParentMouseDown).not.toHaveBeenCalled()
		expect(onParentClick).not.toHaveBeenCalled()
	})

	it('folder (full selected): Deselect all triggers callback once and does not bubble', () => {
		const onSelectAll = vi.fn()
		const onDeselectAll = vi.fn()
		const onParentClick = vi.fn()
		const onParentMouseDown = vi.fn()

		render(
			<Parent
				onParentClick={onParentClick}
				onParentMouseDown={onParentMouseDown}
			>
				<RowActions
					isFolder
					totalDescendantFiles={2}
					selectedDescendantFiles={2}
					onSelectAllInSubtree={onSelectAll}
					onDeselectAllInSubtree={onDeselectAll}
				/>
			</Parent>,
		)

		const btn = screen.getByRole('button', { name: 'Deselect all' })
		fireEvent.mouseDown(btn)
		fireEvent.click(btn)

		expect(onDeselectAll).toHaveBeenCalledTimes(1)
		expect(onSelectAll).not.toHaveBeenCalled()
		expect(onParentMouseDown).not.toHaveBeenCalled()
		expect(onParentClick).not.toHaveBeenCalled()
	})

	it('file (unselected): Select triggers toggle once and does not bubble', () => {
		const onToggleFile = vi.fn()
		const onParentClick = vi.fn()
		const onParentMouseDown = vi.fn()

		render(
			<Parent
				onParentClick={onParentClick}
				onParentMouseDown={onParentMouseDown}
			>
				<RowActions
					isFolder={false}
					fileIsSelected={false}
					onToggleFile={onToggleFile}
				/>
			</Parent>,
		)

		const btn = screen.getByRole('button', { name: 'Select' })
		fireEvent.mouseDown(btn)
		fireEvent.click(btn)

		expect(onToggleFile).toHaveBeenCalledTimes(1)
		expect(onParentMouseDown).not.toHaveBeenCalled()
		expect(onParentClick).not.toHaveBeenCalled()
	})

	it('file (selected): Deselect triggers toggle once and does not bubble', () => {
		const onToggleFile = vi.fn()
		const onParentClick = vi.fn()
		const onParentMouseDown = vi.fn()

		render(
			<Parent
				onParentClick={onParentClick}
				onParentMouseDown={onParentMouseDown}
			>
				<RowActions
					isFolder={false}
					fileIsSelected
					onToggleFile={onToggleFile}
				/>
			</Parent>,
		)

		const btn = screen.getByRole('button', { name: 'Deselect' })
		fireEvent.mouseDown(btn)
		fireEvent.click(btn)

		expect(onToggleFile).toHaveBeenCalledTimes(1)
		expect(onParentMouseDown).not.toHaveBeenCalled()
		expect(onParentClick).not.toHaveBeenCalled()
	})
})

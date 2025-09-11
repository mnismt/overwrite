import { fireEvent, render, screen } from '@testing-library/react'
import type React from 'react'
import { describe, expect, it, vi } from 'vitest'
import ActionButton from '../action-button'

function Parent({
	children,
	onParent,
}: { children: React.ReactNode; onParent: () => void }) {
	return (
		<div
			data-testid="parent"
			onMouseDown={onParent}
			onClick={onParent}
			onDoubleClick={onParent}
		>
			{children}
		</div>
	)
}

describe('MiniActionButton', () => {
	it('calls onPress on mousedown and stops propagation to parent handlers', () => {
		const onPress = vi.fn()
		const onParent = vi.fn()

		render(
			<Parent onParent={onParent}>
				<ActionButton title="Select" onPress={onPress} isSelected={false} />
			</Parent>,
		)

		const btn = screen.getByRole('button', { name: 'Select' })
		fireEvent.mouseDown(btn)

		expect(onPress).toHaveBeenCalledTimes(1)
		expect(onParent).not.toHaveBeenCalled()

		// Subsequent click/dblclick should also not bubble
		fireEvent.click(btn)
		fireEvent.doubleClick(btn)
		expect(onParent).not.toHaveBeenCalled()
	})

	it('renders appropriate icons based on selection state', () => {
		const { rerender } = render(
			<ActionButton title="Select" onPress={() => {}} isSelected={false} />,
		)
		const button = screen.getByRole('button', { name: 'Select' })
		const icon = button.querySelector('vscode-icon')
		expect(icon).toBeTruthy()
		expect(icon?.getAttribute('name')).toBe('add')

		rerender(
			<ActionButton title="Deselect" onPress={() => {}} isSelected={true} />,
		)
		const deselectedButton = screen.getByRole('button', { name: 'Deselect' })
		const checkIcon = deselectedButton.querySelector('vscode-icon')
		expect(checkIcon).toBeTruthy()
		expect(checkIcon?.getAttribute('name')).toBe('check')
	})
})

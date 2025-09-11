import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RespectGitignoreToggle from '../respect-gitignore-toggle'

describe('RespectGitignoreToggle', () => {
	it('renders with initial checked=false and toggles to true', () => {
		const onChange = vi.fn()
		const onDraftChange = vi.fn()
		render(
			<RespectGitignoreToggle
				checked={false}
				onChange={onChange}
				onDraftChange={onDraftChange}
			/>,
		)

		const checkbox = screen.getByTestId('respect-gitignore') as HTMLElement

		// Initially unchecked: attribute should be absent
		expect(checkbox.hasAttribute('checked')).toBe(false)

		// Toggle to true via change event (checked property)
		fireEvent.change(checkbox, { target: { checked: true } })
		expect(onDraftChange).toHaveBeenCalledWith(true)
		expect(onChange).toHaveBeenCalledWith(true)
	})

	it('toggles back to false and does not emit when value is unchanged', () => {
		const onChange = vi.fn()
		const onDraftChange = vi.fn()
		render(
			<RespectGitignoreToggle
				checked={true}
				onChange={onChange}
				onDraftChange={onDraftChange}
			/>,
		)

		const checkbox = screen.getByTestId('respect-gitignore') as HTMLElement

		// First change to same value (true) should not emit
		fireEvent.change(checkbox, { target: { checked: true } })
		expect(onChange).toHaveBeenCalledTimes(0)
		expect(onDraftChange).toHaveBeenCalledTimes(0)

		// Now toggle to false
		fireEvent.change(checkbox, { target: { checked: false } })
		expect(onDraftChange).toHaveBeenCalledWith(false)
		expect(onChange).toHaveBeenCalledWith(false)
	})
})

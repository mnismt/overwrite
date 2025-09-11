import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ExcludedFolders from '../excluded-folders'

describe('ExcludedFolders', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})
	afterEach(() => {
		vi.runOnlyPendingTimers()
		vi.useRealTimers()
	})

	it('debounces onChangeExcludedFolders and emits last value only once', async () => {
		const onChange = vi.fn()
		render(
			<ExcludedFolders
				excludedFolders={'a'}
				onChangeExcludedFolders={onChange}
			/>,
		)

		const textarea = screen.getByLabelText(/Excluded Folders/i)

		fireEvent.input(textarea, { target: { value: 'a1' } })
		fireEvent.input(textarea, { target: { value: 'a12' } })
		fireEvent.input(textarea, { target: { value: 'a123' } })

		await vi.advanceTimersByTimeAsync(149)
		expect(onChange).not.toHaveBeenCalled()

		await vi.advanceTimersByTimeAsync(2)
		expect(onChange).toHaveBeenCalledTimes(1)
		expect(onChange).toHaveBeenLastCalledWith('a123')
	})

	it('syncs local state with prop changes', () => {
		const onChange = vi.fn()
		const { rerender } = render(
			<ExcludedFolders
				excludedFolders={'foo'}
				onChangeExcludedFolders={onChange}
			/>,
		)

		// Change prop -> component should reflect it
		rerender(
			<ExcludedFolders
				excludedFolders={'baz'}
				onChangeExcludedFolders={onChange}
			/>,
		)

		const el = screen.getByLabelText(/Excluded Folders/i) as HTMLElement
		expect(el.getAttribute('value')).toBe('baz')
	})

	it('associates label with textarea via htmlFor/id', () => {
		const onChange = vi.fn()
		render(
			<ExcludedFolders
				excludedFolders={'x'}
				onChangeExcludedFolders={onChange}
			/>,
		)
		// If label association works, getByLabelText finds the custom element
		const el = screen.getByLabelText(/Excluded Folders/i)
		expect(el).toBeInTheDocument()
		expect((el as HTMLElement).id).toBe('excluded-folders')
	})
})

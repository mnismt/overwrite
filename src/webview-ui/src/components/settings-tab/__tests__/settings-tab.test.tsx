import { fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsTab from '..'

describe('SettingsTab', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.runOnlyPendingTimers()
		vi.useRealTimers()
	})

	const setup = (initial = 'node_modules\n.git', readGit = true) => {
		const onSave = vi.fn()
		const utils = render(
			<SettingsTab
				excludedFolders={initial}
				readGitignore={readGit}
				onSaveSettings={onSave}
			/>,
		)
		const getSaveEl = () => screen.getByText('Save') as HTMLElement
		const getTextarea = () =>
			screen.getByLabelText(/Excluded Folders/i) as HTMLElement
		const getCheckbox = () =>
			screen.getByLabelText('Respect .gitignore') as HTMLElement
		return { onSave, ...utils, getSaveEl, getTextarea, getCheckbox }
	}

	it('renders Save disabled initially', () => {
		const { getSaveEl } = setup()
		expect(getSaveEl()).toHaveAttribute('disabled')
	})

	it('enables Save on edit then disables after save and shows toast', async () => {
		const { getTextarea, getSaveEl, onSave } = setup('node_modules')

		// Edit value (debounced change propagation)
		const el1 = getTextarea()
		el1.setAttribute('value', 'node_modules\n.vscode')
		fireEvent.input(el1)

		// No debounce: change should enable immediately
		expect(getSaveEl()).not.toHaveAttribute('disabled')

		// Click Save
		fireEvent.click(getSaveEl())
		expect(onSave).toHaveBeenCalledTimes(1)
		expect(onSave).toHaveBeenCalledWith({
			excludedFolders: 'node_modules\n.vscode',
			readGitignore: true,
		})

		// Button disabled and toast visible
		expect(getSaveEl()).toHaveAttribute('disabled')
		expect(screen.getByText('Settings saved')).toBeInTheDocument()

		// Toast disappears after ~1.5s
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1600)
		})
		expect(screen.queryByText('Settings saved')).not.toBeInTheDocument()
	})

	it('resets draft and dirty when excludedFolders prop updates', async () => {
		const onSave = vi.fn()
		const { rerender } = render(
			<SettingsTab
				excludedFolders={'a'}
				readGitignore={true}
				onSaveSettings={onSave}
			/>,
		)
		const textarea = screen.getByLabelText(/Excluded Folders/i)
		;(textarea as HTMLElement).setAttribute('value', 'a\nb')
		fireEvent.input(textarea)
		await act(async () => {})

		// Prop update (e.g., persisted value arrives)
		rerender(
			<SettingsTab
				excludedFolders={'NEW'}
				readGitignore={true}
				onSaveSettings={onSave}
			/>,
		)

		// Textarea reflects new prop and save returns to disabled
		const save = screen.getByText('Save')
		expect(save).toHaveAttribute('disabled')
		// For custom element, React sets attributes; assert attribute
		const el = screen.getByLabelText(/Excluded Folders/i) as HTMLElement
		expect(el.getAttribute('value')).toBe('NEW')
	})

	it('disables Save if user reverts back to original without saving', async () => {
		const { getTextarea, getSaveEl } = setup('base')

		const el2 = getTextarea()
		el2.setAttribute('value', 'base\nextra')
		fireEvent.input(el2)
		await act(async () => {})
		expect(getSaveEl()).not.toHaveAttribute('disabled')

		// Revert to original
		const el3 = getTextarea()
		el3.setAttribute('value', 'base')
		fireEvent.input(el3)
		await vi.advanceTimersByTimeAsync(160)
		expect(getSaveEl()).toHaveAttribute('disabled')
	})
})

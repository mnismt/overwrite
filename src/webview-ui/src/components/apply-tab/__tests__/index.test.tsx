import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ApplyTab from '../index'
import type { ApplyChangeResponse } from '../types'

// Mock VS Code API
const postMessageSpy = vi.fn()
vi.mock('../../../utils/vscode', () => ({
	getVsCodeApi: () => ({
		postMessage: postMessageSpy,
		getState: () => ({}),
		setState: () => undefined,
	}),
}))

// Mock child components for focused testing
vi.mock('../response-textarea', () => ({
	default: ({
		responseText,
		onTextChange,
	}: {
		responseText: string
		onTextChange: (event: React.SyntheticEvent) => void
	}) => (
		<textarea
			data-testid="mock-response-textarea"
			value={responseText}
			onChange={(e) => onTextChange(e)}
		/>
	),
}))

vi.mock('../apply-actions', () => ({
	default: ({
		isApplying,
		isPreviewing,
		onPreview,
		onApply,
		handleButtonKeyDown,
	}: {
		isApplying: boolean
		isPreviewing: boolean
		onPreview: () => void
		onApply: () => void
		handleButtonKeyDown: (
			event: React.KeyboardEvent<HTMLElement>,
			action: () => void,
		) => void
	}) => (
		<div data-testid="mock-apply-actions">
			<button
				data-testid="preview-button"
				onClick={onPreview}
				onKeyDown={(e) => handleButtonKeyDown(e, onPreview)}
				disabled={isApplying || isPreviewing}
			>
				{isPreviewing ? 'Previewing…' : 'Preview Changes'}
			</button>
			<button
				data-testid="apply-button"
				onClick={onApply}
				onKeyDown={(e) => handleButtonKeyDown(e, onApply)}
				disabled={isApplying || isPreviewing}
			>
				{isApplying ? 'Applying Changes…' : 'Apply Changes'}
			</button>
		</div>
	),
}))

describe('ApplyTab', () => {
	const mockOnApply = vi.fn()
	const mockOnPreview = vi.fn()

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('renders all child components', () => {
		render(<ApplyTab onApply={mockOnApply} onPreview={mockOnPreview} />)

		expect(screen.getByTestId('mock-response-textarea')).toBeInTheDocument()
		expect(screen.getByTestId('mock-apply-actions')).toBeInTheDocument()
	})

	it('handles text input changes', () => {
		render(<ApplyTab onApply={mockOnApply} onPreview={mockOnPreview} />)

		const textarea = screen.getByTestId('mock-response-textarea')
		fireEvent.change(textarea, { target: { value: 'test xml content' } })

		expect(textarea).toHaveValue('test xml content')
	})

	it('shows error when applying with empty text', () => {
		render(<ApplyTab onApply={mockOnApply} onPreview={mockOnPreview} />)

		const applyButton = screen.getByTestId('apply-button')
		fireEvent.click(applyButton)

		expect(mockOnApply).not.toHaveBeenCalled()
		expect(
			screen.getByText('Please paste an XML response first.'),
		).toBeInTheDocument()
	})

	it('shows error when previewing with empty text', () => {
		render(<ApplyTab onApply={mockOnApply} onPreview={mockOnPreview} />)

		const previewButton = screen.getByTestId('preview-button')
		fireEvent.click(previewButton)

		expect(mockOnPreview).not.toHaveBeenCalled()
		expect(
			screen.getByText('Please paste an XML response first.'),
		).toBeInTheDocument()
	})

	it('calls onApply with response text when apply button clicked with text', () => {
		render(<ApplyTab onApply={mockOnApply} onPreview={mockOnPreview} />)

		const textarea = screen.getByTestId('mock-response-textarea')
		const applyButton = screen.getByTestId('apply-button')

		fireEvent.change(textarea, { target: { value: '<file>test</file>' } })
		fireEvent.click(applyButton)

		expect(mockOnApply).toHaveBeenCalledWith('<file>test</file>')
	})

	it('calls onPreview with response text when preview button clicked with text', () => {
		render(<ApplyTab onApply={mockOnApply} onPreview={mockOnPreview} />)

		const textarea = screen.getByTestId('mock-response-textarea')
		const previewButton = screen.getByTestId('preview-button')

		fireEvent.change(textarea, { target: { value: '<file>test</file>' } })
		fireEvent.click(previewButton)

		expect(mockOnPreview).toHaveBeenCalledWith('<file>test</file>')
	})

	it('handles keyboard events on buttons', () => {
		render(<ApplyTab onApply={mockOnApply} onPreview={mockOnPreview} />)

		const textarea = screen.getByTestId('mock-response-textarea')
		const previewButton = screen.getByTestId('preview-button')
		const applyButton = screen.getByTestId('apply-button')

		fireEvent.change(textarea, { target: { value: '<file>test</file>' } })

		// Test Enter key
		fireEvent.keyDown(previewButton, { key: 'Enter' })
		expect(mockOnPreview).toHaveBeenCalledWith('<file>test</file>')

		// Test Space key
		fireEvent.keyDown(applyButton, { key: ' ' })
		expect(mockOnApply).toHaveBeenCalledWith('<file>test</file>')

		// Test other keys don't trigger
		fireEvent.keyDown(previewButton, { key: 'Escape' })
		expect(mockOnPreview).toHaveBeenCalledTimes(1) // Still only once
	})

	it('handles successful apply changes response', async () => {
		render(<ApplyTab onApply={mockOnApply} onPreview={mockOnPreview} />)

		// Trigger apply action first to set currentRequestRef
		const responseTextarea = screen.getByTestId('mock-response-textarea')
		fireEvent.change(responseTextarea, { target: { value: '<opx>test</opx>' } })

		const applyButton = screen.getByTestId('apply-button')
		fireEvent.click(applyButton)

		const successMessage: ApplyChangeResponse = {
			command: 'applyChangesResult',
			success: true,
			results: [
				{
					path: '/test/file.ts',
					action: 'modify',
					success: true,
					message: 'File modified successfully',
				},
			],
		}

		// Simulate message from extension - will be processed because apply was triggered above
		globalThis.window.dispatchEvent(
			new MessageEvent('message', { data: successMessage }),
		)

		await waitFor(() => {
			expect(mockOnApply).toHaveBeenCalled()
		})
	})

	it('handles failed apply changes response', async () => {
		render(<ApplyTab onApply={mockOnApply} onPreview={mockOnPreview} />)

		// Trigger apply action first to set currentRequestRef
		const responseTextarea = screen.getByTestId('mock-response-textarea')
		fireEvent.change(responseTextarea, { target: { value: '<opx>test</opx>' } })

		const applyButton = screen.getByTestId('apply-button')
		fireEvent.click(applyButton)

		const errorMessage: ApplyChangeResponse = {
			command: 'applyChangesResult',
			success: false,
			errors: ['XML parsing failed', 'Invalid file path'],
		}

		globalThis.window.dispatchEvent(
			new MessageEvent('message', { data: errorMessage }),
		)

		await waitFor(() => {
			expect(mockOnApply).toHaveBeenCalled()
		})
	})

	it('handles successful preview changes response', async () => {
		render(<ApplyTab onApply={mockOnApply} onPreview={mockOnPreview} />)

		// Trigger preview action first to set currentRequestRef
		const responseTextarea = screen.getByTestId('mock-response-textarea')
		fireEvent.change(responseTextarea, { target: { value: '<opx>test</opx>' } })

		const previewButton = screen.getByTestId('preview-button')
		fireEvent.click(previewButton)

		const successMessage: ApplyChangeResponse = {
			command: 'previewChangesResult',
			success: true,
		}

		globalThis.window.dispatchEvent(
			new MessageEvent('message', { data: successMessage }),
		)

		await waitFor(() => {
			expect(mockOnPreview).toHaveBeenCalled()
		})
	})

	it('handles failed preview changes response', async () => {
		render(<ApplyTab onApply={mockOnApply} onPreview={mockOnPreview} />)

		// Trigger preview action first to set currentRequestRef
		const responseTextarea = screen.getByTestId('mock-response-textarea')
		fireEvent.change(responseTextarea, { target: { value: '<opx>test</opx>' } })

		const previewButton = screen.getByTestId('preview-button')
		fireEvent.click(previewButton)

		const errorMessage: ApplyChangeResponse = {
			command: 'previewChangesResult',
			success: false,
			errors: ['Preview generation failed'],
		}

		globalThis.window.dispatchEvent(
			new MessageEvent('message', { data: errorMessage }),
		)

		await waitFor(() => {
			expect(mockOnPreview).toHaveBeenCalled()
		})
	})

	it('clears errors when starting new apply operation', () => {
		render(<ApplyTab onApply={mockOnApply} onPreview={mockOnPreview} />)

		const textarea = screen.getByTestId('mock-response-textarea')
		const applyButton = screen.getByTestId('apply-button')

		// First, create an error state
		fireEvent.click(applyButton)
		expect(
			screen.getByText('Please paste an XML response first.'),
		).toBeInTheDocument()

		// Then start a new apply operation
		fireEvent.change(textarea, {
			target: { value: '<file>new content</file>' },
		})
		fireEvent.click(applyButton)

		// Errors should be cleared
		expect(
			screen.queryByText('Please paste an XML response first.'),
		).not.toBeInTheDocument()
		expect(mockOnApply).toHaveBeenCalledWith('<file>new content</file>')
	})

	it('clears errors when starting new preview operation', () => {
		render(<ApplyTab onApply={mockOnApply} onPreview={mockOnPreview} />)

		const textarea = screen.getByTestId('mock-response-textarea')
		const previewButton = screen.getByTestId('preview-button')

		// First, create an error state
		fireEvent.click(previewButton)
		expect(
			screen.getByText('Please paste an XML response first.'),
		).toBeInTheDocument()

		// Then start a new preview operation
		fireEvent.change(textarea, {
			target: { value: '<file>new content</file>' },
		})
		fireEvent.click(previewButton)

		// Errors should be cleared
		expect(
			screen.queryByText('Please paste an XML response first.'),
		).not.toBeInTheDocument()
		expect(mockOnPreview).toHaveBeenCalledWith('<file>new content</file>')
	})
})

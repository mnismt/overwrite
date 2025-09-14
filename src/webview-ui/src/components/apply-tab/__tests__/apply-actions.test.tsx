import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ApplyActions from '../apply-actions'

describe('ApplyActions', () => {
	const mockOnPreview = vi.fn()
	const mockOnApply = vi.fn()
	const mockHandleButtonKeyDown = vi.fn()

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('renders both preview and apply buttons', () => {
		render(
			<ApplyActions
				isApplying={false}
				isPreviewing={false}
				onPreview={mockOnPreview}
				onApply={mockOnApply}
				handleButtonKeyDown={mockHandleButtonKeyDown}
			/>,
		)

		expect(screen.getByText('Preview Changes')).toBeInTheDocument()
		expect(screen.getByText('Apply Changes')).toBeInTheDocument()
	})

	it('shows loading text when previewing', () => {
		render(
			<ApplyActions
				isApplying={false}
				isPreviewing={true}
				onPreview={mockOnPreview}
				onApply={mockOnApply}
				handleButtonKeyDown={mockHandleButtonKeyDown}
			/>,
		)

		expect(screen.getByText('Previewing…')).toBeInTheDocument()
		expect(screen.getByText('Apply Changes')).toBeInTheDocument()
	})

	it('shows loading text when applying', () => {
		render(
			<ApplyActions
				isApplying={true}
				isPreviewing={false}
				onPreview={mockOnPreview}
				onApply={mockOnApply}
				handleButtonKeyDown={mockHandleButtonKeyDown}
			/>,
		)

		expect(screen.getByText('Preview Changes')).toBeInTheDocument()
		expect(screen.getByText('Applying Changes…')).toBeInTheDocument()
	})

	it('calls onPreview when preview button is clicked', () => {
		render(
			<ApplyActions
				isApplying={false}
				isPreviewing={false}
				onPreview={mockOnPreview}
				onApply={mockOnApply}
				handleButtonKeyDown={mockHandleButtonKeyDown}
			/>,
		)

		const previewButton = screen.getByText('Preview Changes').closest('vscode-button')!!
		fireEvent.click(previewButton)

		expect(mockOnPreview).toHaveBeenCalledTimes(1)
	})

	it('calls onApply when apply button is clicked', () => {
		render(
			<ApplyActions
				isApplying={false}
				isPreviewing={false}
				onPreview={mockOnPreview}
				onApply={mockOnApply}
				handleButtonKeyDown={mockHandleButtonKeyDown}
			/>,
		)

		const applyButton = screen.getByText('Apply Changes').closest('vscode-button')!
		fireEvent.click(applyButton)

		expect(mockOnApply).toHaveBeenCalledTimes(1)
	})

	it('disables both buttons when previewing', () => {
		render(
			<ApplyActions
				isApplying={false}
				isPreviewing={true}
				onPreview={mockOnPreview}
				onApply={mockOnApply}
				handleButtonKeyDown={mockHandleButtonKeyDown}
			/>,
		)

		const previewButton = screen.getByText('Previewing…').closest('vscode-button')!
		const applyButton = screen.getByText('Apply Changes').closest('vscode-button')!

		expect(previewButton).toHaveAttribute('disabled')
		expect(applyButton).toHaveAttribute('disabled')
	})

	it('disables both buttons when applying', () => {
		render(
			<ApplyActions
				isApplying={true}
				isPreviewing={false}
				onPreview={mockOnPreview}
				onApply={mockOnApply}
				handleButtonKeyDown={mockHandleButtonKeyDown}
			/>,
		)

		const previewButton = screen.getByText('Preview Changes').closest('vscode-button')!
		const applyButton = screen.getByText('Applying Changes…').closest('vscode-button')!

		expect(previewButton).toHaveAttribute('disabled')
		expect(applyButton).toHaveAttribute('disabled')
	})

	it('handles keyboard events on preview button', () => {
		render(
			<ApplyActions
				isApplying={false}
				isPreviewing={false}
				onPreview={mockOnPreview}
				onApply={mockOnApply}
				handleButtonKeyDown={mockHandleButtonKeyDown}
			/>,
		)

		const previewButton = screen.getByText('Preview Changes').closest('vscode-button')!
		const keyEvent = { key: 'Enter', preventDefault: vi.fn() }

		fireEvent.keyDown(previewButton, keyEvent)

		expect(mockHandleButtonKeyDown).toHaveBeenCalledTimes(1)
		expect(mockHandleButtonKeyDown).toHaveBeenCalledWith(
			expect.objectContaining({ key: 'Enter' }),
			mockOnPreview,
		)
	})

	it('handles keyboard events on apply button', () => {
		render(
			<ApplyActions
				isApplying={false}
				isPreviewing={false}
				onPreview={mockOnPreview}
				onApply={mockOnApply}
				handleButtonKeyDown={mockHandleButtonKeyDown}
			/>,
		)

		const applyButton = screen.getByText('Apply Changes').closest('vscode-button')!
		const keyEvent = { key: ' ', preventDefault: vi.fn() }

		fireEvent.keyDown(applyButton, keyEvent)

		expect(mockHandleButtonKeyDown).toHaveBeenCalledTimes(1)
		expect(mockHandleButtonKeyDown).toHaveBeenCalledWith(
			expect.objectContaining({ key: ' ' }),
			mockOnApply,
		)
	})

	it('buttons are disabled when applying or previewing', () => {
		const { rerender } = render(
			<ApplyActions
				isApplying={true}
				isPreviewing={false}
				onPreview={mockOnPreview}
				onApply={mockOnApply}
				handleButtonKeyDown={mockHandleButtonKeyDown}
			/>,
		)

		const previewButton = screen.getByText('Preview Changes').closest('vscode-button')!
		const applyButton = screen.getByText('Applying Changes…').closest('vscode-button')!

		expect(previewButton).toHaveAttribute('disabled')
		expect(applyButton).toHaveAttribute('disabled')

		// Test with previewing state
		rerender(
			<ApplyActions
				isApplying={false}
				isPreviewing={true}
				onPreview={mockOnPreview}
				onApply={mockOnApply}
				handleButtonKeyDown={mockHandleButtonKeyDown}
			/>,
		)

		const previewButtonPreviewing = screen.getByText('Previewing…').closest('vscode-button')!
		const applyButtonPreviewing = screen.getByText('Apply Changes').closest('vscode-button')!

		expect(previewButtonPreviewing).toHaveAttribute('disabled')
		expect(applyButtonPreviewing).toHaveAttribute('disabled')
	})

	it('has correct button styling and appearance', () => {
		render(
			<ApplyActions
				isApplying={false}
				isPreviewing={false}
				onPreview={mockOnPreview}
				onApply={mockOnApply}
				handleButtonKeyDown={mockHandleButtonKeyDown}
			/>,
		)

		const previewButton = screen.getByText('Preview Changes').closest('vscode-button')!
		const applyButton = screen.getByText('Apply Changes').closest('vscode-button')!

		// Preview button should have secondary appearance
		expect(previewButton).toHaveAttribute('appearance', 'secondary')
		// Apply button should not have appearance attribute (default primary)
		expect(applyButton).not.toHaveAttribute('appearance')
	})

	it('enables buttons when neither applying nor previewing', () => {
		render(
			<ApplyActions
				isApplying={false}
				isPreviewing={false}
				onPreview={mockOnPreview}
				onApply={mockOnApply}
				handleButtonKeyDown={mockHandleButtonKeyDown}
			/>,
		)

		const previewButton = screen.getByText('Preview Changes').closest('vscode-button')!
		const applyButton = screen.getByText('Apply Changes').closest('vscode-button')!

		expect(previewButton).not.toHaveAttribute('disabled')
		expect(applyButton).not.toHaveAttribute('disabled')
	})

	it('maintains button layout structure', () => {
		const { container } = render(
			<ApplyActions
				isApplying={false}
				isPreviewing={false}
				onPreview={mockOnPreview}
				onApply={mockOnApply}
				handleButtonKeyDown={mockHandleButtonKeyDown}
			/>,
		)

		// Check that buttons are wrapped in a flex container
		const buttonContainer = container.querySelector('.flex.gap-2.mt-2')
		expect(buttonContainer).toBeInTheDocument()
		expect(buttonContainer?.children).toHaveLength(2)
	})
})
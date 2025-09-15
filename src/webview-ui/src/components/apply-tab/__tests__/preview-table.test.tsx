import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import PreviewTable from '../preview-table'
import type { PreviewData } from '../types'

describe('PreviewTable', () => {
	const mockOnApplyRow = vi.fn()

	beforeEach(() => {
		mockOnApplyRow.mockClear()
	})

	it('renders null when no preview data is provided', () => {
		const { container } = render(
			<PreviewTable previewData={null} onApplyRow={mockOnApplyRow} />,
		)
		expect(container.firstChild).toBeNull()
	})

	it('displays errors when present', () => {
		const previewData: PreviewData = {
			rows: [],
			errors: ['Parse error', 'Validation error'],
		}

		render(
			<PreviewTable previewData={previewData} onApplyRow={mockOnApplyRow} />,
		)

		expect(screen.getByText('Preview Errors:')).toBeInTheDocument()
		expect(screen.getByText('Parse error')).toBeInTheDocument()
		expect(screen.getByText('Validation error')).toBeInTheDocument()
	})

	it('displays "no changes" message when rows are empty', () => {
		const previewData: PreviewData = {
			rows: [],
			errors: [],
		}

		render(
			<PreviewTable previewData={previewData} onApplyRow={mockOnApplyRow} />,
		)

		expect(
			screen.getByText('No changes detected in the XML response.'),
		).toBeInTheDocument()
	})

	it('renders table with file actions', () => {
		const previewData: PreviewData = {
			rows: [
				{
					path: 'src/test.ts',
					action: 'create',
					description: 'Create new test file',
					changes: { added: 10, removed: 0 },
				},
				{
					path: 'src/old.ts',
					action: 'delete',
					description: 'Delete old file',
					changes: { added: 0, removed: 25 },
				},
			],
			errors: [],
		}

		render(
			<PreviewTable previewData={previewData} onApplyRow={mockOnApplyRow} />,
		)

		expect(screen.getByText('Proposed Changes:')).toBeInTheDocument()
		expect(screen.getByText('src/test.ts')).toBeInTheDocument()
		expect(screen.getByText('Create new test file')).toBeInTheDocument()
		expect(screen.getByText('+10')).toBeInTheDocument()
		expect(screen.getByText('src/old.ts')).toBeInTheDocument()
		expect(screen.getByText('Delete old file')).toBeInTheDocument()
		expect(screen.getByText('−25')).toBeInTheDocument()
	})

	it('displays rename action with new path', () => {
		const previewData: PreviewData = {
			rows: [
				{
					path: 'old-name.ts',
					action: 'rename',
					description: 'Rename to new-name.ts',
					changes: { added: 0, removed: 0 },
					newPath: 'new-name.ts',
				},
			],
			errors: [],
		}

		render(
			<PreviewTable previewData={previewData} onApplyRow={mockOnApplyRow} />,
		)

		expect(screen.getByText('old-name.ts')).toBeInTheDocument()
		expect(screen.getByText('→ new-name.ts')).toBeInTheDocument()
		expect(screen.getByText('Rename to new-name.ts')).toBeInTheDocument()
	})

	it('displays inline error for problematic rows', () => {
		const previewData: PreviewData = {
			rows: [
				{
					path: 'error-file.ts',
					action: 'modify',
					description: 'Update function',
					changes: { added: 5, removed: 3 },
					hasError: true,
					errorMessage: 'File not found',
				},
			],
			errors: [],
		}

		render(
			<PreviewTable previewData={previewData} onApplyRow={mockOnApplyRow} />,
		)

		expect(screen.getByText('Update function')).toBeInTheDocument()
		expect(screen.getByText('File not found')).toBeInTheDocument()
	})

	it('handles mixed changes display correctly', () => {
		const previewData: PreviewData = {
			rows: [
				{
					path: 'mixed.ts',
					action: 'modify',
					description: 'Mixed changes',
					changes: { added: 7, removed: 3 },
				},
			],
			errors: [],
		}

		render(
			<PreviewTable previewData={previewData} onApplyRow={mockOnApplyRow} />,
		)

		expect(screen.getByText('+7')).toBeInTheDocument()
		expect(screen.getByText('−3')).toBeInTheDocument()
	})

	it('shows "—" for zero additions and removals', () => {
		const previewData: PreviewData = {
			rows: [
				{
					path: 'no-change.ts',
					action: 'rename',
					description: 'Just rename',
					changes: { added: 0, removed: 0 },
				},
			],
			errors: [],
		}

		render(
			<PreviewTable previewData={previewData} onApplyRow={mockOnApplyRow} />,
		)

		expect(screen.getByText('—')).toBeInTheDocument()
	})

	it('calls onApplyRow when apply button is clicked', () => {
		const previewData: PreviewData = {
			rows: [
				{
					path: 'test.ts',
					action: 'create',
					description: 'Create file',
					changes: { added: 5, removed: 0 },
				},
			],
			errors: [],
		}

		render(
			<PreviewTable previewData={previewData} onApplyRow={mockOnApplyRow} />,
		)

		const applyButton = screen.getByLabelText('Apply create to test.ts')
		fireEvent.click(applyButton)

		expect(mockOnApplyRow).toHaveBeenCalledWith(0)
	})

	it('disables apply button for rows with errors', () => {
		const previewData: PreviewData = {
			rows: [
				{
					path: 'error.ts',
					action: 'modify',
					description: 'Failed modification',
					changes: { added: 2, removed: 1 },
					hasError: true,
					errorMessage: 'Syntax error',
				},
			],
			errors: [],
		}

		render(
			<PreviewTable previewData={previewData} onApplyRow={mockOnApplyRow} />,
		)

		const applyButton = screen.getByLabelText('Apply modify to error.ts')
		expect(applyButton).toBeDisabled()
	})

	it('disables apply buttons when applying', () => {
		const previewData: PreviewData = {
			rows: [
				{
					path: 'test.ts',
					action: 'create',
					description: 'Create file',
					changes: { added: 5, removed: 0 },
				},
			],
			errors: [],
		}

		render(
			<PreviewTable
				previewData={previewData}
				onApplyRow={mockOnApplyRow}
				isApplying={true}
			/>,
		)

		const applyButton = screen.getByLabelText('Apply create to test.ts')
		expect(applyButton).toBeDisabled()
	})

	it('has proper table structure with headers', () => {
		const previewData: PreviewData = {
			rows: [
				{
					path: 'test.ts',
					action: 'create',
					description: 'Create file',
					changes: { added: 5, removed: 0 },
				},
			],
			errors: [],
		}

		render(
			<PreviewTable previewData={previewData} onApplyRow={mockOnApplyRow} />,
		)

		expect(screen.getByText('Path')).toBeInTheDocument()
		expect(screen.getByText('Description')).toBeInTheDocument()
		expect(screen.getByText('Changes')).toBeInTheDocument()
		expect(screen.getByText('Actions')).toBeInTheDocument()
	})
})

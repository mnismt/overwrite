import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ResultsDisplay from '../results-display'
import type { ApplyResult } from '../types'

const postMessageSpy = vi.fn()

vi.mock('../../../utils/vscode', () => ({
	getVsCodeApi: () => ({
		postMessage: postMessageSpy,
		getState: () => ({}),
		setState: () => undefined,
	}),
}))

beforeEach(() => {
	postMessageSpy.mockClear()
})

describe('ResultsDisplay', () => {
	it('renders nothing when no results or errors', () => {
		const { container } = render(
			<ResultsDisplay results={null} errors={null} />,
		)

		expect(container.firstChild).toBeNull()
	})

	it('displays error messages', () => {
		const errors = ['XML parsing failed', 'Invalid file path', 'Network error']

		render(<ResultsDisplay results={null} errors={errors} />)

		expect(screen.getByText('Copy Errors')).toBeInTheDocument()
		expect(screen.getByText('Results:')).toBeInTheDocument()
		expect(screen.getByText('Errors:')).toBeInTheDocument()

		for (const error of errors) {
			expect(screen.getByText(error)).toBeInTheDocument()
		}
	})

	it('displays successful results in table format', () => {
		const results: ApplyResult[] = [
			{
				path: '/src/component.ts',
				action: 'modify',
				success: true,
				message: 'File modified successfully',
			},
			{
				path: '/src/newfile.ts',
				action: 'create',
				success: true,
				message: 'File created successfully',
			},
		]

		render(<ResultsDisplay results={results} errors={null} />)

		expect(screen.getByText('Results:')).toBeInTheDocument()
		expect(screen.getByText('File Operations:')).toBeInTheDocument()

		// Check table structure
		expect(screen.getByText('Path').closest('vscode-table')).toBeInTheDocument()
		expect(screen.getByText('Path')).toBeInTheDocument()
		expect(screen.getByText('Action')).toBeInTheDocument()
		expect(screen.getByText('Status')).toBeInTheDocument()
		expect(screen.getByText('Message')).toBeInTheDocument()

		// Check result data
		expect(screen.getByText('/src/component.ts')).toBeInTheDocument()
		expect(screen.getByText('modify')).toBeInTheDocument()
		expect(screen.getByText('/src/newfile.ts')).toBeInTheDocument()
		expect(screen.getByText('create')).toBeInTheDocument()
	})

	it('displays failed results with appropriate styling', () => {
		const results: ApplyResult[] = [
			{
				path: '/src/missing.ts',
				action: 'modify',
				success: false,
				message: 'File not found',
			},
		]

		render(<ResultsDisplay results={results} errors={null} />)

		expect(screen.getByText('Copy Errors')).toBeInTheDocument()
		const statusBadge = screen.getByText('Failed')
		expect(statusBadge).toBeInTheDocument()
		expect(statusBadge).toHaveAttribute('variant', 'default')
		expect(statusBadge).toHaveStyle({
			color: 'var(--vscode-testing-iconFailed)',
		})
	})

	it('displays successful results with appropriate styling', () => {
		const results: ApplyResult[] = [
			{
				path: '/src/component.ts',
				action: 'modify',
				success: true,
				message: 'File modified successfully',
			},
		]

		render(<ResultsDisplay results={results} errors={null} />)

		const statusBadge = screen.getByText('Success')
		expect(statusBadge).toBeInTheDocument()
		expect(statusBadge).toHaveAttribute('variant', 'counter')
		expect(statusBadge).toHaveStyle({
			color: 'var(--vscode-testing-iconPassed)',
		})
	})

	it('displays both errors and results when both are present', () => {
		const errors = ['Some operation failed']
		const results: ApplyResult[] = [
			{
				path: '/src/success.ts',
				action: 'create',
				success: true,
				message: 'Created successfully',
			},
		]

		render(<ResultsDisplay results={results} errors={errors} />)

		// Both sections should be present
		expect(screen.getByText('Results:')).toBeInTheDocument()
		expect(screen.getByText('Errors:')).toBeInTheDocument()
		expect(screen.getByText('File Operations:')).toBeInTheDocument()

		// Error content
		expect(screen.getByText('Some operation failed')).toBeInTheDocument()

		// Result content
		expect(screen.getByText('/src/success.ts')).toBeInTheDocument()
		expect(screen.getByText('Success')).toBeInTheDocument()
	})

	it('handles empty results array', () => {
		const results: ApplyResult[] = []

		render(<ResultsDisplay results={results} errors={null} />)

		expect(screen.getByText('Results:')).toBeInTheDocument()
		expect(screen.queryByText('Copy Errors')).not.toBeInTheDocument()
		// Empty results array should not show "File Operations:" section
		expect(screen.queryByText('File Operations:')).not.toBeInTheDocument()
		expect(screen.queryByText('Path')).not.toBeInTheDocument()
	})

	it('handles empty errors array', () => {
		const errors: string[] = []

		render(<ResultsDisplay results={null} errors={errors} />)

		expect(screen.getByText('Results:')).toBeInTheDocument()
		expect(screen.queryByText('Copy Errors')).not.toBeInTheDocument()
		// Empty errors array should not show "Errors:" section
		expect(screen.queryByText('Errors:')).not.toBeInTheDocument()
	})

	it('applies correct error styling', () => {
		const errors = ['Test error']

		render(<ResultsDisplay results={null} errors={errors} />)

		const errorHeading = screen.getByText('Errors:')
		const errorList = errorHeading.nextElementSibling

		expect(errorHeading).toHaveStyle({
			color: 'var(--vscode-errorForeground)',
		})
		expect(errorList).toHaveStyle({
			color: 'var(--vscode-errorForeground)',
		})
	})

	it('displays multiple results with mixed success/failure', () => {
		const results: ApplyResult[] = [
			{
				path: '/src/success1.ts',
				action: 'modify',
				success: true,
				message: 'Modified successfully',
			},
			{
				path: '/src/failed1.ts',
				action: 'create',
				success: false,
				message: 'Permission denied',
			},
			{
				path: '/src/success2.ts',
				action: 'rewrite',
				success: true,
				message: 'Rewritten successfully',
			},
		]

		render(<ResultsDisplay results={results} errors={null} />)

		// Check all paths are displayed
		expect(screen.getByText('/src/success1.ts')).toBeInTheDocument()
		expect(screen.getByText('/src/failed1.ts')).toBeInTheDocument()
		expect(screen.getByText('/src/success2.ts')).toBeInTheDocument()

		// Check all actions are displayed
		expect(screen.getByText('modify')).toBeInTheDocument()
		expect(screen.getByText('create')).toBeInTheDocument()
		expect(screen.getByText('rewrite')).toBeInTheDocument()

		// Check status badges
		const successBadges = screen.getAllByText('Success')
		const failedBadges = screen.getAllByText('Failed')

		expect(successBadges).toHaveLength(2)
		expect(failedBadges).toHaveLength(1)
	})

	it('copies aggregated errors via VS Code API', () => {
		const errors = ['Global failure']
		const results: ApplyResult[] = [
			{
				path: '/src/fail.ts',
				action: 'modify',
				success: false,
				message: 'Patch not found',
			},
		]

		render(<ResultsDisplay results={results} errors={errors} />)

		const btn = screen.getByText('Copy Errors')
		fireEvent.click(btn)

		expect(postMessageSpy).toHaveBeenCalledWith({
			command: 'copyApplyErrors',
			payload: {
				text: expect.stringContaining('/src/fail.ts (modify): Patch not found'),
			},
		})
	})

	it('handles long file paths and messages properly', () => {
		const results: ApplyResult[] = [
			{
				path: '/very/long/path/to/some/deeply/nested/file/with/a/very/long/name.tsx',
				action: 'modify',
				success: true,
				message:
					'This is a very long success message that might wrap to multiple lines in the table cell and should be handled gracefully by the component',
			},
		]

		render(<ResultsDisplay results={results} errors={null} />)

		const longPath = screen.getByText(
			'/very/long/path/to/some/deeply/nested/file/with/a/very/long/name.tsx',
		)
		const longMessage = screen.getByText(/This is a very long success message/)

		// Check that long content is rendered
		expect(longPath).toBeInTheDocument()
		expect(longMessage).toBeInTheDocument()

		// Check that table cells have proper styling for long content
		const pathCell = longPath.closest('vscode-table-cell')
		const messageCell = longMessage.closest('vscode-table-cell')

		expect(pathCell).toHaveStyle({ whiteSpace: 'normal' })
		expect(messageCell).toHaveStyle({ whiteSpace: 'normal' })
	})
})

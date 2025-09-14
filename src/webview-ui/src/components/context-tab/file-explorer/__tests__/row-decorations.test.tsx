import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import RowDecorations from '../row-decorations'

describe('RowDecorations', () => {
	it('shows status dot and a token badge for full-selected folder', () => {
		render(
			<RowDecorations
				isFolder
				folderSelectionState="full"
				folderTokenTotal={1234}
			/>,
		)
		// Status dot via title
		expect(screen.getByTitle('Fully included')).toBeInTheDocument()
		// Badge exists and has text
		expect(screen.getByText(/\d/)).toBeInTheDocument()
	})

	it('shows partial status dot for partial-selected folder', () => {
		render(
			<RowDecorations
				isFolder
				folderSelectionState="partial"
				folderTokenTotal={0}
			/>,
		)
		expect(screen.getByTitle('Partially included')).toBeInTheDocument()
	})

	it('renders nothing for empty folder (no decorations)', () => {
		const { container } = render(
			<RowDecorations
				isFolder
				folderSelectionState="none"
				folderTokenTotal={0}
			/>,
		)
		// component returns null
		expect(container.firstChild).toBeNull()
	})

	it('shows a token badge for selected file', () => {
		render(
			<RowDecorations isFolder={false} fileIsSelected fileTokenCount={42} />,
		)
		expect(screen.getByText(/\d/)).toBeInTheDocument()
	})

	describe('Token count colors', () => {
		it('displays green color for fully selected folder token count', () => {
			render(
				<RowDecorations
					isFolder
					folderSelectionState="full"
					folderTokenTotal={1234}
				/>,
			)
			const tokenBadge = screen.getByText(/1\.2k/)
			expect(tokenBadge).toHaveStyle({
				color: 'var(--vscode-testing-iconPassed)',
				opacity: '0.8',
			})
		})

		it('displays yellow color for partially selected folder token count', () => {
			render(
				<RowDecorations
					isFolder
					folderSelectionState="partial"
					folderTokenTotal={5600}
				/>,
			)
			const tokenBadge = screen.getByText(/5\.6k/)
			expect(tokenBadge).toHaveStyle({
				color: 'var(--vscode-testing-iconQueued)',
				opacity: '0.8',
			})
		})

		it('displays default color for unselected folder with no token count', () => {
			render(
				<RowDecorations
					isFolder
					folderSelectionState="none"
					folderTokenTotal={0}
				/>,
			)
			// Should render nothing for empty folder
			const tokenBadge = screen.queryByText(/\d/)
			expect(tokenBadge).not.toBeInTheDocument()
		})

		it('displays green color for selected file token count', () => {
			render(
				<RowDecorations
					isFolder={false}
					fileIsSelected
					fileTokenCount={789}
				/>,
			)
			const tokenBadge = screen.getByText(/789/)
			expect(tokenBadge).toHaveStyle({
				color: 'var(--vscode-testing-iconPassed)',
				opacity: '0.8',
			})
		})

		it('displays default color for unselected file (no token badge shown)', () => {
			render(
				<RowDecorations
					isFolder={false}
					fileIsSelected={false}
					fileTokenCount={100}
				/>,
			)
			// Token badge should not be shown for unselected files
			const tokenBadge = screen.queryByText(/100/)
			expect(tokenBadge).not.toBeInTheDocument()
		})

		it('handles zero token count appropriately', () => {
			render(
				<RowDecorations
					isFolder
					folderSelectionState="full"
					folderTokenTotal={0}
				/>,
			)
			// Should still show the status dot but no token badge
			expect(screen.getByTitle('Fully included')).toBeInTheDocument()
			const tokenBadge = screen.queryByText(/0/)
			expect(tokenBadge).not.toBeInTheDocument()
		})
	})
})

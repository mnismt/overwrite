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
})

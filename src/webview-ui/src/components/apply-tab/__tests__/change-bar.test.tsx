import { render } from '@testing-library/react'
import '@testing-library/jest-dom'
import ChangeBar from '../change-bar'
import type { ChangeSummary } from '../types'

describe('ChangeBar', () => {
	it('renders empty bar for no changes', () => {
		const changes: ChangeSummary = { added: 0, removed: 0 }
		const { container } = render(<ChangeBar changes={changes} />)

		const bar = container.querySelector('.flex.h-2')
		expect(bar).toHaveClass('bg-muted')
	})

	it('renders only green bar for additions only', () => {
		const changes: ChangeSummary = { added: 10, removed: 0 }
		render(<ChangeBar changes={changes} />)

		const greenBar = document.querySelector('.bg-green-600')
		expect(greenBar).toBeInTheDocument()
		expect(greenBar).toHaveStyle('width: 100%')
		expect(greenBar).toHaveAttribute('title', '+10 lines added')
	})

	it('renders only red bar for removals only', () => {
		const changes: ChangeSummary = { added: 0, removed: 5 }
		render(<ChangeBar changes={changes} />)

		const redBar = document.querySelector('.bg-red-600')
		expect(redBar).toBeInTheDocument()
		expect(redBar).toHaveStyle('width: 100%')
		expect(redBar).toHaveAttribute('title', '-5 lines removed')
	})

	it('renders proportional bars for mixed changes', () => {
		const changes: ChangeSummary = { added: 3, removed: 7 }
		render(<ChangeBar changes={changes} />)

		const greenBar = document.querySelector('.bg-green-600')
		const redBar = document.querySelector('.bg-red-600')

		expect(greenBar).toBeInTheDocument()
		expect(redBar).toBeInTheDocument()

		// 3 added out of 10 total = 30%
		expect(greenBar).toHaveStyle('width: 30%')
		// 7 removed out of 10 total = 70%
		expect(redBar).toHaveStyle('width: 70%')
	})

	it('has correct accessibility attributes', () => {
		const changes: ChangeSummary = { added: 2, removed: 3 }
		render(<ChangeBar changes={changes} />)

		const greenBar = document.querySelector('.bg-green-600')
		const redBar = document.querySelector('.bg-red-600')

		expect(greenBar).toHaveAttribute('title', '+2 lines added')
		expect(redBar).toHaveAttribute('title', '-3 lines removed')
	})
})

import { render, screen } from '@testing-library/react'
import React from 'react'
import type { VscodeTreeItem } from '../../../../../types'
import ContextTab from '../index'

vi.mock('../../../utils/vscode', () => ({
	getVsCodeApi: () => ({ postMessage: () => {} }),
}))

const noop = () => {}

describe('ContextTab layout', () => {
	const baseProps = {
		selectedCount: 0,
		onCopy: noop,
		fileTreeData: [] as VscodeTreeItem[],
		selectedUris: new Set<string>(),
		onSelect: noop,
		onRefresh: noop,
		isLoading: false,
	}

	it('renders sticky footer with compact stats and dual copy buttons', () => {
		const { container } = render(<ContextTab {...baseProps} />)

		// Footer container is fixed
		const footer = container.querySelector('div.fixed.bottom-0') as HTMLElement
		expect(footer).toBeInTheDocument()

		// Stats are present with paragraphs (scope to stats container)
		const stats = footer.querySelector('.text-xs.text-muted') as HTMLElement
		expect(stats).toBeInTheDocument()
		const rows = Array.from(stats.querySelectorAll('p'))
		expect(rows).toHaveLength(5)
		expect(rows[0]).toHaveTextContent(/^\s*Selected files:\s*0\s*$/)
		expect(rows[1]).toHaveTextContent(/^\s*File tokens \(actual\):\s*0\s*$/)
		expect(rows[2]).toHaveTextContent(/^\s*User instruction tokens:\s*0\s*$/)
		expect(rows[3]).toHaveTextContent(/^\s*Total tokens \(Copy Context\):\s*0\s*$/)
		expect(rows[4]).toHaveTextContent(/^\s*Total tokens \(Copy Context \+ XML\):\s*5000\s*$/)

		// Dual buttons via custom web components
		const buttons = footer.querySelectorAll('vscode-button')
		expect(buttons.length).toBe(2)
		expect(buttons[0].textContent).toMatch(/Copy Context$/)
		expect(buttons[1].textContent).toMatch(/Copy Context \+ XML/)
	})

	it('only the tree area scrolls', () => {
		const { container } = render(<ContextTab {...baseProps} />)
		const scrollArea = container.querySelector(
			'[data-testid="context-tree-scroll"]',
		) as HTMLElement
		expect(scrollArea).toBeInTheDocument()
		// Ensure we applied the intended overflow utility classes
		const className = scrollArea.className
		expect(className).toContain('overflow-auto')
		expect(className).toContain('min-h-0')
		expect(className).toContain('flex-1')
	})
})

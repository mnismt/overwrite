import { render } from '@testing-library/react'
import React from 'react'
import App from '../App'

vi.mock('../utils/vscode', () => ({
  getVsCodeApi: () => ({ postMessage: () => {} }),
}))

describe('App layout shell', () => {
  it('locks tabs to the top and disables page scroll', () => {
    const { container } = render(<App />)
    const main = container.querySelector('main') as HTMLElement
    expect(main).toBeInTheDocument()
    expect(main.className).toContain('h-screen')
    expect(main.className).toContain('overflow-hidden')

    const tabs = container.querySelector('vscode-tabs') as HTMLElement
    expect(tabs).toBeInTheDocument()
    expect(tabs.className).toContain('h-full')
    expect(tabs.className).toContain('overflow-hidden')
  })
})

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RowDecorations from '../row-decorations'

describe('RowDecorations', () => {
  it('shows Full and a token badge for full-selected folder', () => {
    render(
      <RowDecorations isFolder folderSelectionState="full" folderTokenTotal={1234} />,
    )
    expect(screen.getByText('Full')).toBeInTheDocument()
    // Badge exists and has text
    expect(screen.getByText(/\d/)).toBeInTheDocument()
  })

  it('shows Half for partial-selected folder', () => {
    render(<RowDecorations isFolder folderSelectionState="partial" folderTokenTotal={0} />)
    expect(screen.getByText('Half')).toBeInTheDocument()
  })

  it('renders nothing for empty folder (no decorations)', () => {
    const { container } = render(
      <RowDecorations isFolder folderSelectionState="none" folderTokenTotal={0} />,
    )
    // component returns null
    expect(container.firstChild).toBeNull()
  })

  it('shows F and a token badge for selected file', () => {
    render(<RowDecorations isFolder={false} fileIsSelected fileTokenCount={42} />)
    expect(screen.getByText('F')).toBeInTheDocument()
    expect(screen.getByText(/\d/)).toBeInTheDocument()
  })
})

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MiniActionButton from '../mini-action-button'

function Parent({ children, onParent }: { children: React.ReactNode; onParent: () => void }) {
  return (
    <div data-testid="parent" onMouseDown={onParent} onClick={onParent} onDoubleClick={onParent}>
      {children}
    </div>
  )
}

describe('MiniActionButton', () => {
  it('calls onPress on mousedown and stops propagation to parent handlers', () => {
    const onPress = vi.fn()
    const onParent = vi.fn()

    render(
      <Parent onParent={onParent}>
        <MiniActionButton icon="add" title="Select" onPress={onPress} />
      </Parent>,
    )

    const btn = screen.getByRole('button', { name: 'Select' })
    fireEvent.mouseDown(btn)

    expect(onPress).toHaveBeenCalledTimes(1)
    expect(onParent).not.toHaveBeenCalled()

    // Subsequent click/dblclick should also not bubble
    fireEvent.click(btn)
    fireEvent.doubleClick(btn)
    expect(onParent).not.toHaveBeenCalled()
  })

  it('renders plus/minus symbols depending on icon', () => {
    const { rerender } = render(<MiniActionButton icon="add" title="Select" onPress={() => {}} />)
    expect(screen.getByRole('button', { name: 'Select' }).textContent).toBe('+')

    rerender(<MiniActionButton icon="close" title="Deselect" onPress={() => {}} />)
    expect(screen.getByRole('button', { name: 'Deselect' }).textContent).toBe('×')
  })
})

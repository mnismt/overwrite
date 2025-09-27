import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ApplyTab from '../index'

// Mock VS Code API
const postMessageSpy = vi.fn()
vi.mock('../../../utils/vscode', () => ({
  getVsCodeApi: () => ({
    postMessage: postMessageSpy,
    getState: () => ({}),
    setState: () => undefined,
  }),
}))

// Reuse simple child mocks from existing suite to get a textarea and buttons
vi.mock('../response-textarea', () => ({
  default: ({
    responseText,
    onTextChange,
  }: {
    responseText: string
    onTextChange: (event: React.SyntheticEvent) => void
  }) => (
    <textarea data-testid="mock-response-textarea" value={responseText} onChange={(e) => onTextChange(e)} />
  ),
}))

vi.mock('../apply-actions', () => ({
  default: ({
    isApplying,
    isPreviewing,
    onPreview,
    onApply,
    handleButtonKeyDown,
  }: {
    isApplying: boolean
    isPreviewing: boolean
    onPreview: () => void
    onApply: () => void
    handleButtonKeyDown: (event: React.KeyboardEvent<HTMLElement>, action: () => void) => void
  }) => (
    <div data-testid="mock-apply-actions">
      <button data-testid="preview-button" onClick={onPreview} onKeyDown={(e) => handleButtonKeyDown(e, onPreview)} disabled={isApplying || isPreviewing}>
        {isPreviewing ? 'Previewing…' : 'Preview Changes'}
      </button>
      <button data-testid="apply-button" onClick={onApply} onKeyDown={(e) => handleButtonKeyDown(e, onApply)} disabled={isApplying || isPreviewing}>
        {isApplying ? 'Applying Changes…' : 'Apply Changes'}
      </button>
    </div>
  ),
}))

describe('ApplyTab OPX flow', () => {
  const onApply = vi.fn()
  const onPreview = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes preprocessed OPX to onApply (attributes normalized)', () => {
    render(<ApplyTab onApply={onApply} onPreview={onPreview} />)

    const textarea = screen.getByTestId('mock-response-textarea') as HTMLTextAreaElement
    const applyBtn = screen.getByTestId('apply-button')

    const raw = "<EDIT FILE='src/A.ts' OP='NEW'><put><<<\nX\n>>> </put></EDIT>"
    fireEvent.change(textarea, { target: { value: raw } })
    fireEvent.click(applyBtn)

    // Expect cleaned string passed to onApply - attribute normalization but tag case preserved
    const arg = onApply.mock.calls[0]?.[0] as string
    expect(arg).toContain('file="src/A.ts"')
    expect(arg).toContain('op=')
    expect(arg).toContain('<<<\nX\n>>>') // payload untouched
  })

  it('shows lint warnings in UI for missing attributes on preview', () => {
    render(<ApplyTab onApply={onApply} onPreview={onPreview} />)

    const textarea = screen.getByTestId('mock-response-textarea') as HTMLTextAreaElement
    const previewBtn = screen.getByTestId('preview-button')

    const bad = '<edit op="new"><put><<<\nX\n>>> </put></edit>'
    fireEvent.change(textarea, { target: { value: bad } })
    fireEvent.click(previewBtn)

    // Lint box visible with at least one item about missing file/op
    expect(screen.getByText('Lint')).toBeInTheDocument()
  })
})

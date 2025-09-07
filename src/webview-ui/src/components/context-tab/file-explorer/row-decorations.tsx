import React from 'react'
import { formatTokenCount } from '../utils'

export type FolderSelectionState = 'none' | 'partial' | 'full'

interface RowDecorationsProps {
  isFolder: boolean
  folderSelectionState?: FolderSelectionState
  folderTokenTotal?: number
  fileIsSelected?: boolean
  fileTokenCount?: number
}

const RowDecorations: React.FC<RowDecorationsProps> = React.memo(
  ({ isFolder, folderSelectionState, folderTokenTotal = 0, fileIsSelected = false, fileTokenCount = 0 }) => {
    const parts: React.ReactNode[] = []
    if (isFolder) {
      if (folderSelectionState === 'full') {
        parts.push(
          <span key="full" style={{ color: 'var(--vscode-testing-iconPassed)' }}>
            Full
          </span>,
        )
      } else if (folderSelectionState === 'partial') {
        parts.push(
          <span key="half" style={{ color: 'var(--vscode-testing-iconQueued)' }}>
            Half
          </span>,
        )
      }
      if (folderTokenTotal > 0) {
        parts.push(
          <vscode-badge key="tok" variant="counter">
            {formatTokenCount(folderTokenTotal)}
          </vscode-badge>,
        )
      }
    } else {
      if (fileIsSelected) {
        parts.push(
          <span key="f" style={{ color: 'var(--vscode-testing-iconPassed)' }}>
            F
          </span>,
        )
        parts.push(
          <vscode-badge key="tok" variant="counter">
            {formatTokenCount(fileTokenCount)}
          </vscode-badge>,
        )
      }
    }
    if (parts.length === 0) return null
    return <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>{parts}</div>
  },
)
RowDecorations.displayName = 'RowDecorations'

export default RowDecorations

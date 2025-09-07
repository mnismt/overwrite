import React from 'react'
import MiniActionButton from './mini-action-button'

interface RowActionsProps {
  isFolder: boolean
  totalDescendantFiles?: number
  selectedDescendantFiles?: number
  onSelectAllInSubtree?: () => void
  onDeselectAllInSubtree?: () => void
  fileIsSelected?: boolean
  onToggleFile?: () => void
}

const wrapperStyle: React.CSSProperties = { display: 'flex', gap: 4 }

const RowActions: React.FC<RowActionsProps> = React.memo(
  ({
    isFolder,
    totalDescendantFiles = 0,
    selectedDescendantFiles = 0,
    onSelectAllInSubtree,
    onDeselectAllInSubtree,
    fileIsSelected = false,
    onToggleFile,
  }) => {
    if (isFolder) {
      if (totalDescendantFiles > 0 && selectedDescendantFiles === totalDescendantFiles) {
        return (
          <div style={wrapperStyle}>
            <MiniActionButton icon="close" title="Deselect all" onPress={() => onDeselectAllInSubtree?.()} />
          </div>
        )
      }
      if (selectedDescendantFiles > 0) {
        return (
          <div style={wrapperStyle}>
            <MiniActionButton icon="close" title="Deselect all" onPress={() => onDeselectAllInSubtree?.()} />
          </div>
        )
      }
      return (
        <div style={wrapperStyle}>
          <MiniActionButton icon="add" title="Select all" onPress={() => onSelectAllInSubtree?.()} />
        </div>
      )
    }

    return (
      <div style={wrapperStyle}>
        <MiniActionButton
          icon={fileIsSelected ? 'close' : 'add'}
          title={fileIsSelected ? 'Deselect' : 'Select'}
          onPress={() => onToggleFile?.()}
        />
      </div>
    )
  },
)
RowActions.displayName = 'RowActions'

export default RowActions

import { useEffect, useState } from 'react'

interface RespectGitignoreToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  onDraftChange?: (checked: boolean) => void
}

// Separate checkbox component for the "Respect .gitignore" setting.
// Mirrors the pattern used by ExcludedFolders (local state, optional draft hook).
const RespectGitignoreToggle: React.FC<RespectGitignoreToggleProps> = ({
  checked,
  onChange,
  onDraftChange,
}) => {
  const [localChecked, setLocalChecked] = useState<boolean>(checked)

  // Keep local state in sync with upstream changes
  useEffect(() => {
    if (checked !== localChecked) setLocalChecked(checked)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked])

  return (
    <div>
      <vscode-checkbox
        id="read-gitignore"
        name="readGitignore"
        label="Respect .gitignore"
        className="pl-1"
        toggle
        data-testid="respect-gitignore"
        checked={localChecked}
        onChange={(e) => {
          const target = e.target as unknown as { checked?: boolean } & HTMLElement
          const next = target?.checked ?? target.getAttribute('checked') !== null
          const boolNext = !!next
          if (boolNext !== localChecked) {
            setLocalChecked(boolNext)
            onDraftChange?.(boolNext)
            onChange(boolNext)
          }
        }}
      ></vscode-checkbox>
    </div>
  )
}

export default RespectGitignoreToggle

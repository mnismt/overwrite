import type React from 'react'
import type { ChangeSummary } from './types'

interface ChangeBarProps {
	changes: ChangeSummary
}

// Render a simple proportional bar showing additions vs deletions.
const ChangeBar: React.FC<ChangeBarProps> = ({ changes }) => {
	const { added, removed } = changes
	const total = added + removed

	if (total === 0) {
		return (
			<div
				className="flex h-2 w-full rounded bg-muted"
				aria-label="No changes"
				role="img"
				title="No changes"
			></div>
		)
	}

	const addPct = Math.round((added / total) * 100)
	const remPct = 100 - addPct

	return (
		<div
			className="flex h-2 w-full overflow-hidden rounded"
			aria-label={`+${added} additions, -${removed} deletions`}
			role="img"
			title={`+${added} additions, -${removed} deletions`}
		>
			{added > 0 && (
				<div
					className="bg-green-600"
					style={{ width: `${addPct}%` }}
					title={`+${added} lines added`}
					aria-hidden="true"
				></div>
			)}
			{removed > 0 && (
				<div
					className="bg-red-600"
					style={{ width: `${remPct}%` }}
					title={`-${removed} lines removed`}
					aria-hidden="true"
				></div>
			)}
		</div>
	)
}

export default ChangeBar

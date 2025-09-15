import type React from 'react'
import type { ChangeSummary } from './types'

interface ChangeBarProps {
	changes: ChangeSummary
}

const ChangeBar: React.FC<ChangeBarProps> = ({ changes }) => {
	const { added, removed } = changes
	const total = added + removed

	if (total === 0) {
		return (
			<div className="flex h-2 w-full max-w-20 rounded-sm overflow-hidden bg-muted border border-gray-300">
				<div className="w-full bg-gray-200"></div>
			</div>
		)
	}

	const addedRatio = total > 0 ? (added / total) * 100 : 0
	const removedRatio = total > 0 ? (removed / total) * 100 : 0

	return (
		<div className="flex h-2 w-full max-w-20 rounded-sm overflow-hidden bg-gray-200 border border-gray-300">
			{added > 0 && (
				<div
					className="bg-green-600"
					style={{ width: `${addedRatio}%` }}
					title={`+${added} lines added`}
				></div>
			)}
			{removed > 0 && (
				<div
					className="bg-red-600"
					style={{ width: `${removedRatio}%` }}
					title={`-${removed} lines removed`}
				></div>
			)}
		</div>
	)
}

export default ChangeBar

import type React from 'react'
import type { ChangeSummary } from './types'

interface ChangeBarProps {
	changes: ChangeSummary
}

// Render a GitHub-like diffstat made of small squares.
// The number of green vs red squares reflects the proportion of additions vs deletions.
const ChangeBar: React.FC<ChangeBarProps> = ({ changes }) => {
	const { added, removed } = changes
	const total = added + removed

	// Number of squares to render (keep compact, similar to GitHub)
	const SQUARE_COUNT = 6

	if (total === 0) {
		return (
			<div
				className="flex h-2 items-center gap-0.5 bg-muted"
				aria-label="No changes"
				role="img"
				title="No changes"
			>
				{Array.from({ length: SQUARE_COUNT }).map((_, idx) => (
					<div
						key={idx}
						className="h-2 w-2 rounded-sm bg-gray-200 border border-gray-300"
					></div>
				))}
			</div>
		)
	}

	// Distribute squares by ratio. Keep some neutral squares if rounding leaves slack.
	let greenSquares = Math.round((added / total) * SQUARE_COUNT)
	let redSquares = Math.round((removed / total) * SQUARE_COUNT)
	// Normalize to not exceed total squares
	if (greenSquares + redSquares > SQUARE_COUNT) {
		const overflow = greenSquares + redSquares - SQUARE_COUNT
		// Reduce the larger side first to preserve proportions visually
		if (greenSquares >= redSquares) greenSquares -= overflow
		else redSquares -= overflow
	}
	const neutralSquares = Math.max(0, SQUARE_COUNT - greenSquares - redSquares)

	const squares: Array<'green' | 'red' | 'neutral'> = [
		...Array(greenSquares).fill('green'),
		...Array(redSquares).fill('red'),
		...Array(neutralSquares).fill('neutral'),
	]

	return (
		<div
			className="flex h-2 items-center gap-0.5"
			aria-label={`+${added} additions, -${removed} deletions`}
			role="img"
			title={`+${added} additions, -${removed} deletions`}
		>
			{(() => {
				const elements: React.ReactElement[] = []
				let idx = 0
				for (const type of squares) {
					if (type === 'green') {
						elements.push(
							<div
								key={`g-${idx}`}
								className="h-2 w-2 bg-green-600 border border-green-700"
								title={`+${added} lines added`}
							></div>,
						)
					} else if (type === 'red') {
						elements.push(
							<div
								key={`r-${idx}`}
								className="h-2 w-2 bg-red-600 border border-red-700"
								title={`-${removed} lines removed`}
							></div>,
						)
					} else {
						elements.push(
							<div
								key={`n-${idx}`}
								className="h-2 w-2 bg-gray-200 border border-gray-300"
								title=""
							></div>,
						)
					}
					idx += 1
				}
				return elements
			})()}
		</div>
	)
}

export default ChangeBar

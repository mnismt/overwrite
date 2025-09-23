import type React from 'react'

interface FileTreeSkeletonProps {
	itemCount?: number
	className?: string
}

const FileTreeSkeleton: React.FC<FileTreeSkeletonProps> = ({
	itemCount = 8,
	className = '',
}) => {
	const skeletonItems = Array.from({ length: itemCount }, (_, index) => {
		// Create a mix of files and folders with different indentation levels
		const isFolder = index % 3 === 0
		const depth = Math.floor(Math.random() * 3)
		const width = isFolder
			? `${60 + Math.random() * 40}%`
			: `${40 + Math.random() * 50}%`

		return (
			<div
				key={index}
				className="skeleton-tree-item"
				style={{
					paddingLeft: `${depth * 16 + 8}px`,
					animationDelay: `${index * 50}ms`,
				}}
			>
				<div className="flex items-center gap-2 py-1">
					{/* Icon placeholder */}
					<div className="skeleton-icon" />
					{/* Text placeholder */}
					<div className="skeleton-text" style={{ width }} />
				</div>
			</div>
		)
	})

	return (
		<div className={`skeleton-container ${className}`}>{skeletonItems}</div>
	)
}

export default FileTreeSkeleton

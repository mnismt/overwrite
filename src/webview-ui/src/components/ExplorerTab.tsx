import type React from 'react'
import { useCallback } from 'react'

// TODO: Define props interface as needed (e.g., tree data, selection handlers)

const ExplorerTab: React.FC = () => {
	// TODO: Add state for search input

	const handleRefresh = useCallback(() => {
		console.log('Refresh clicked')
		// TODO: Send 'getFileTree' message to extension
		// vscode.postMessage({ command: 'getFileTree' });
	}, [])

	const handleSearch = useCallback((event: React.SyntheticEvent) => {
		const target = event.target as HTMLInputElement
		console.log('Search input:', target.value)
		// TODO: Implement filtering logic or send message to extension
	}, [])

	// Basic keydown handler for button accessibility
	const handleButtonKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLElement>, action: () => void) => {
			if (event.key === 'Enter' || event.key === ' ') {
				action()
			}
		},
		[],
	)

	return (
		<div>
			<div
				style={{
					display: 'flex',
					gap: '8px',
					alignItems: 'center',
					marginBottom: '8px',
				}}
			>
				<vscode-button
					onClick={handleRefresh}
					onKeyDown={(e) => handleButtonKeyDown(e, handleRefresh)}
				>
					Refresh
					<span slot="start" className="codicon codicon-refresh" />
				</vscode-button>
				<vscode-textfield
					placeholder="Search files..."
					style={{ flexGrow: 1 }} // Allow textfield to grow
					onInput={handleSearch} // Use onInput for immediate feedback
				>
					<span slot="start" className="codicon codicon-search" />
				</vscode-textfield>
			</div>
			<vscode-progress-ring style={{ display: 'none' }} />
			{/* TODO: Replace with vscode-tree */}
			<div
				id="file-tree-container-placeholder"
				style={{ height: '300px', border: '1px dashed grey' }}
			>
				Tree Placeholder
			</div>
		</div>
	)
}

export default ExplorerTab

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import '@vscode-elements/elements/dist/vscode-button'
import '@vscode-elements/elements/dist/vscode-tabs'
import '@vscode-elements/elements/dist/vscode-tab-header'
import '@vscode-elements/elements/dist/vscode-tab-panel'
import '@vscode-elements/elements/dist/vscode-tree'
import '@vscode-elements/elements/dist/vscode-textfield'
import '@vscode-elements/elements/dist/vscode-textarea'
import '@vscode-elements/elements/dist/vscode-label'
import '@vscode-elements/elements/dist/vscode-form-container'
import '@vscode-elements/elements/dist/vscode-table'
import '@vscode-elements/elements/dist/vscode-table-body'
import '@vscode-elements/elements/dist/vscode-table-cell'
import '@vscode-elements/elements/dist/vscode-table-header'
import '@vscode-elements/elements/dist/vscode-table-header-cell'
import '@vscode-elements/elements/dist/vscode-table-row'
import '@vscode-elements/elements/dist/vscode-badge'
import '@vscode-elements/elements/dist/vscode-divider'
import '@vscode-elements/elements/dist/vscode-toolbar-button'
import '@vscode-elements/elements/dist/vscode-tree-item'

if (import.meta.env.DEV) {
	await import('@vscode-elements/webview-playground')
}
createRoot(document.getElementById('root')!).render(
	<StrictMode>
		{import.meta.env.DEV ? <vscode-dev-toolbar /> : null}
		<App />
	</StrictMode>,
)

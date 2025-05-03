// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode'
import * as path from 'node:path'
import * as fs from 'node:fs/promises' // Use promises version of fs

// Define the structure expected by the vscode-tree component
interface VscodeTreeAction {
	icon: string
	actionId: string
	tooltip: string
}

interface VscodeTreeItem {
	label: string // File/Folder name
	value: string // Use relative path as the value
	subItems?: VscodeTreeItem[] // Children for folders
	open?: boolean // Default state for folders (optional)
	selected?: boolean // Selection state (optional)
	icons: {
		branch: string
		leaf: string
		open: string
	}
	// Add decorations based on VS Code Tree item structure
	decorations?: {
		badge?: string | number
		tooltip?: string
		iconPath?:
			| string
			| vscode.Uri
			| { light: string | vscode.Uri; dark: string | vscode.Uri }
		color?: string | vscode.ThemeColor
		// Any other properties the vscode-tree component might support for decorations
	}
	actions?: VscodeTreeAction[] // Actions for the item
}

export class FileExplorerWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'aboveRepoFilesWebview'

	private _view?: vscode.WebviewView
	private excludedDirs = [
		'.git',
		'node_modules',
		'.vscode',
		'.cursor',
		'dist',
		'out',
	] // Directories to exclude

	constructor(private readonly _extensionUri: vscode.Uri) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this._extensionUri, 'media'),
				vscode.Uri.joinPath(this._extensionUri, 'node_modules'),
			],
		}

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview)

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(async (message) => {
			console.log('Message received from webview:', message)
			switch (message.command) {
				case 'getFileTree':
					try {
						const workspaceFiles = await this.getWorkspaceFiles()
						webviewView.webview.postMessage({
							command: 'updateFileTree',
							data: workspaceFiles, // This will now be VscodeTreeItem[]
						})
					} catch (error) {
						vscode.window.showErrorMessage(
							`Error getting workspace files: ${error}`,
						)
						// Optionally send an error message back to the webview
						webviewView.webview.postMessage({
							command: 'showError',
							message: `Error getting workspace files: ${error}`,
						})
					}
					return
				// Add cases for selection, etc. later
			}
		})
	}

	// Basic function to get files/folders from the workspace root
	private async getWorkspaceFiles(): Promise<VscodeTreeItem[]> {
		const workspaceFolders = vscode.workspace.workspaceFolders
		if (!workspaceFolders || workspaceFolders.length === 0) {
			vscode.window.showInformationMessage('No workspace folder open.')
			return []
		}
		const rootPath = workspaceFolders[0].uri.fsPath
		// Start recursion from the root, passing the root path for relative path calculation
		return this.readDirectoryRecursive(rootPath, rootPath)
	}

	private async readDirectoryRecursive(
		dirPath: string,
		rootPath: string,
	): Promise<VscodeTreeItem[]> {
		const items: VscodeTreeItem[] = []

		// Define icons for files and folders
		const icons = {
			branch: 'folder', // Closed folder icon
			leaf: 'file', // File icon
			open: 'folder-opened', // Opened folder icon
		}

		try {
			const entries = await fs.readdir(dirPath, { withFileTypes: true })
			const sortedEntries = entries.sort((a, b) => {
				if (a.isDirectory() && !b.isDirectory()) return -1
				if (!a.isDirectory() && b.isDirectory()) return 1
				return a.name.localeCompare(b.name)
			})

			for (const entry of sortedEntries) {
				const fullPath = path.join(dirPath, entry.name)
				const relativePath = path.relative(rootPath, fullPath)

				if (
					this.excludedDirs.includes(entry.name) ||
					(entry.isDirectory() &&
						this.excludedDirs.some(
							(excludedDir) =>
								relativePath === excludedDir ||
								relativePath.startsWith(excludedDir + path.sep),
						))
				) {
					continue
				}

				const item: VscodeTreeItem = {
					label: entry.name,
					value: relativePath,
					icons: entry.isDirectory()
						? { ...icons, open: 'folder-opened' }
						: { ...icons, leaf: 'file' },
					actions: [
						{
							icon: 'add',
							actionId: 'add',
							tooltip: 'Add File/Folder',
						},
						{
							icon: 'remove',
							actionId: 'remove',
							tooltip: 'Remove File/Folder',
						},
					],
				}

				if (entry.isDirectory()) {
					const subItems = await this.readDirectoryRecursive(fullPath, rootPath)
					if (subItems.length > 0) {
						item.subItems = subItems
					}
				}

				items.push(item)
			}
		} catch (error) {
			console.error(`Error reading directory ${dirPath}: ${error}`)
		}

		return items
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		// Get paths to local resources
		const scriptPath = vscode.Uri.joinPath(
			this._extensionUri,
			'media',
			'webview.js',
		)
		const stylePath = vscode.Uri.joinPath(
			this._extensionUri,
			'media',
			'webview.css',
		)

		const elementsBundlePath = vscode.Uri.joinPath(
			this._extensionUri,
			'node_modules',
			'@vscode-elements',
			'elements',
			'dist',
			'bundled.js',
		)
		const codiconsPath = vscode.Uri.joinPath(
			this._extensionUri,
			'node_modules',
			'@vscode',
			'codicons',
			'dist',
			'codicon.css',
		)

		// Convert resource URIs to webview URIs
		const scriptUri = webview.asWebviewUri(scriptPath)
		const styleUri = webview.asWebviewUri(stylePath)
		const elementsBundleUri = webview.asWebviewUri(elementsBundlePath)
		const codiconsUri = webview.asWebviewUri(codiconsPath)

		// Use a nonce to only allow specific scripts to be run
		const nonce = getNonce()

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<!--
	Use a content security policy to only allow loading styles from our extension directory,
	and only allow running scripts with the specified nonce.
	-->
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link href="${styleUri}" rel="stylesheet">
	<link href="${codiconsUri}" rel="stylesheet" id="vscode-codicon-stylesheet">
	<title>Above Repo Files</title>
</head>
<body>
	<h1>Above Repo</h1>

	<vscode-tabs selected-index="0">
		<vscode-tab-header slot="header">Explorer</vscode-tab-header>
		<vscode-tab-panel>
			<div style="padding-top: 20px; padding-bottom: 10px;">
				<button id="refresh-button">Refresh</button>
				<input type="text" id="search-input" placeholder="Search files...">
				<vscode-progress-ring id="progress-ring" style="display: none;"></vscode-progress-ring>
				<vscode-tree id="file-tree-container"></vscode-tree>
			</div>
		</vscode-tab-panel>

		<vscode-tab-header slot="header">Context</vscode-tab-header>
		<vscode-tab-panel>
			<!-- Content for Context tab (PRD 2.2) -->
			<p>Context building and prompt generation features will go here.</p>
		</vscode-tab-panel>

		<vscode-tab-header slot="header">Apply</vscode-tab-header>
		<vscode-tab-panel>
			<!-- Content for Apply tab (PRD 3.3) -->
			<p>Applying LLM changes features will go here.</p>
		</vscode-tab-panel>
	</vscode-tabs>

	<vscode-divider />

	<script nonce="${nonce}" src="${scriptUri}"></script>
	<script
		src="${elementsBundleUri}"
		type="module"
		nonce="${nonce}"
	></script>
</body>
</html>`
	}
}

// Generates a random nonce string for CSP
function getNonce() {
	let text = ''
	const possible =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length))
	}
	return text
}

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode'
import * as path from 'node:path'
import * as fs from 'node:fs/promises' // Use promises version of fs

// Import prompt generation functions
import {
	generateFileMap,
	generateFileContents,
	generatePrompt,
} from './prompts' // Assuming prompts/index.ts is in the same dir
import type { VscodeTreeItem } from './types' // Import types
import { getNonce } from './utils/webviewUtils' // Import getNonce
import { getWorkspaceFileTree } from './utils/fileSystemUtils' // Import file tree function

// Define the structure expected by the vscode-tree component

// Store the full tree data in the provider instance
let fullTreeCache: VscodeTreeItem[] = []

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
						// Use the imported function, passing exclusions
						const workspaceFiles = await getWorkspaceFileTree(this.excludedDirs)
						fullTreeCache = workspaceFiles // Cache the full tree
						webviewView.webview.postMessage({
							command: 'updateFileTree',
							data: workspaceFiles, // This will now be VscodeTreeItem[]
						})
					} catch (error: unknown) {
						const errorMessage =
							error instanceof Error ? error.message : String(error)
						vscode.window.showErrorMessage(
							`Error getting workspace files: ${errorMessage}`,
						)
						// Optionally send an error message back to the webview
						webviewView.webview.postMessage({
							command: 'showError',
							message: `Error getting workspace files: ${errorMessage}`,
						})
					}
					break // Use break instead of return inside block scope
				case 'copyContext':
				case 'copyContextXml':
					try {
						const workspaceFolders = vscode.workspace.workspaceFolders
						if (!workspaceFolders || workspaceFolders.length === 0) {
							throw new Error('No workspace folder open.')
						}
						const rootPath = workspaceFolders[0].uri.fsPath
						const selectedPaths = new Set<string>(message.selectedPaths || [])
						const userInstructions = message.userInstructions || ''
						const includeXml = message.command === 'copyContextXml'

						console.log({
							selectedPaths,
							userInstructions,
						})

						// Ensure fullTreeCache is populated
						if (fullTreeCache.length === 0) {
							console.log('Full tree cache empty, fetching...')
							// Use imported function if cache is empty
							fullTreeCache = await getWorkspaceFileTree(this.excludedDirs)
						}

						// Generate components using imported functions
						const fileMap = generateFileMap(
							fullTreeCache,
							selectedPaths,
							rootPath,
						)
						const fileContents = await generateFileContents(
							selectedPaths,
							rootPath,
						)

						// Generate the final prompt
						const prompt = generatePrompt(
							fileMap,
							fileContents,
							userInstructions,
							includeXml,
						)

						// Copy to clipboard
						await vscode.env.clipboard.writeText(prompt)
						vscode.window.showInformationMessage('Context copied to clipboard!')
					} catch (error: unknown) {
						const errorMessage =
							error instanceof Error ? error.message : String(error)
						console.error('Error generating or copying context:', error)
						vscode.window.showErrorMessage(
							`Error generating context: ${errorMessage}`,
						)
					}
					break // Use break instead of return inside block scope
				// Add cases for selection, etc. later
			}
		})
	}

	private _getHtmlForWebview(webview: vscode.Webview): string {
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

		// NOTE: The extensive linter errors for the HTML string below are likely due to
		// the linter misinterpreting the embedded HTML as TypeScript code.
		// These errors can usually be ignored if the HTML itself is valid.
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<!--
	Use a content security policy to only allow loading styles from our extension directory,
	and only allow running scripts with the specified nonce.
	(Allowing 'unsafe-inline' for style-src is required for vscode-elements theming)
	-->
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
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
			<h2>Files Explorer</h2>
			<button id="refresh-button" style="margin-right: 10px;">Refresh</button>
			<input type="text" id="search-input" placeholder="Search files...">
			<vscode-progress-ring id="progress-ring" style="display: none;"></vscode-progress-ring>
			<vscode-tree id="file-tree-container"></vscode-tree>
		</vscode-tab-panel>

		<vscode-tab-header slot="header">Context</vscode-tab-header>
		<vscode-tab-panel>
			<!-- Content for Context tab (PRD 2.2) -->
			<p>Selected files: <span id="selected-count">0</span></p>
			<h3>User Instructions</h3>
			<vscode-textarea id="user-instructions" placeholder="Enter instructions for the AI..." style="width: 100%;" rows="5"></vscode-textarea>
			<div style="margin-top: 10px;">
				<vscode-button id="copy-button">Copy Context</vscode-button>
				<vscode-button id="copy-xml-button" style="margin-left: 5px;">Copy Context with XML Instructions</vscode-button>
			</div>
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

	// --- Removed Helper Functions for Context Generation ---
	// (Moved to src/prompts/index.ts)
	// --- Removed File System Functions ---
	// (Moved to src/utils/fileSystemUtils.ts)
}

// Generates a random nonce string for CSP

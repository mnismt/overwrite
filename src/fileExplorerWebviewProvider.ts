// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode'
import * as path from 'node:path'
import * as fs from 'node:fs/promises' // Use promises version of fs
import type { Uri } from 'vscode' // Import Uri as type

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

const DEV_WEBVIEW_URL = 'http://localhost:5173'

export class FileExplorerWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'aboveRepoFilesWebview'

	private _view?: vscode.WebviewView
	private _context: vscode.ExtensionContext
	private excludedDirs = [
		'.git',
		'node_modules',
		'.vscode',
		'.cursor',
		'dist',
		'out',
	] // Directories to exclude

	constructor(
		private readonly _extensionUri: vscode.Uri,
		context: vscode.ExtensionContext,
	) {
		this._context = context
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView

		// Allow scripts and setup resource roots
		const isDevelopment =
			this._context.extensionMode === vscode.ExtensionMode.Development
		const localResourceRoots = [
			vscode.Uri.joinPath(this._extensionUri, 'media'),
			vscode.Uri.joinPath(this._extensionUri, 'dist'),
		]
		if (isDevelopment) {
			// Allow connection to Vite dev server
			localResourceRoots.push(vscode.Uri.parse('http://localhost:5173'))
		}

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: localResourceRoots,
		}

		webviewView.webview.html = this._getHtmlForWebview(
			webviewView.webview,
			isDevelopment,
		)

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

	private _getHtmlForWebview(
		webview: vscode.Webview,
		isDevelopment: boolean,
	): string {
		if (isDevelopment) {
			return this._getDevHtml()
		}
		// If not development, return production HTML
		return this._getProdHtml(webview)
	}

	private _getDevHtml(): string {
		const nonce = getNonce()
		// Slightly less strict CSP for development to allow HMR, eval source maps etc.
		return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="${DEV_WEBVIEW_URL}/node_modules/@vscode/codicons/dist/codicon.css" rel="stylesheet" id="vscode-codicon-stylesheet" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${DEV_WEBVIEW_URL} data:; connect-src ${DEV_WEBVIEW_URL} ws://localhost:5173; img-src ${DEV_WEBVIEW_URL} https: data:; script-src 'unsafe-eval' 'unsafe-inline' ${DEV_WEBVIEW_URL}; style-src 'unsafe-inline' ${DEV_WEBVIEW_URL};">
    <script type="module">
      // Manual React Refresh preamble injection
      import { injectIntoGlobalHook } from "${DEV_WEBVIEW_URL}/@react-refresh"
      injectIntoGlobalHook(window)
      window.$RefreshReg$ = () => {}
      window.$RefreshSig$ = () => (type) => type
      window.__vite_plugin_react_preamble_installed__ = true
    </script>
    <script type="module" src="${DEV_WEBVIEW_URL}/@vite/client"></script>
    <link rel="icon" type="image/svg+xml" href="${DEV_WEBVIEW_URL}/vite.svg" />
    <title>Above Repo (Dev)</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${DEV_WEBVIEW_URL}/src/main.tsx"></script>
    <script nonce="${nonce}">
      // Pass vscode API and nonce to the webview
      window.nonce = "${nonce}"
      window.vscode = acquireVsCodeApi()
    </script>
  </body>
</html>`
	}

	private _getProdHtml(webview: vscode.Webview): string {
		const nonce = getNonce()
		const cspSource = webview.cspSource

		// Paths to built assets, referencing the structure defined in vite.config.ts
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(
				this._extensionUri,
				'dist',
				'webview-ui',
				'assets',
				'index.js',
			),
		)
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(
				this._extensionUri,
				'dist',
				'webview-ui',
				'assets',
				'index.css',
			),
		)

		// Path to codicons from the extension's node_modules
		const codiconUri = webview.asWebviewUri(
			vscode.Uri.joinPath(
				this._extensionUri,
				'node_modules',
				'@vscode',
				'codicons',
				'dist',
				'codicon.css',
			),
		)

		return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${codiconUri}" rel="stylesheet" id="vscode-codicon-stylesheet" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${cspSource}; img-src ${cspSource} https: data:; script-src 'nonce-${nonce}'; style-src ${cspSource} 'unsafe-inline';">
  <link rel="stylesheet" type="text/css" href="${styleUri}">
  <title>Above Repo</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
  <script nonce="${nonce}">
    // Pass vscode API and nonce to the webview
    window.nonce = "${nonce}"
    window.vscode = acquireVsCodeApi()
  </script>
</body>
</html>`
	}
}

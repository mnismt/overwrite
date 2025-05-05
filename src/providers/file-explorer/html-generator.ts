import * as vscode from 'vscode'
import { getNonce } from '../../utils/webview'

const DEV_WEBVIEW_URL = 'http://localhost:5173'

/**
 * Generates the HTML content for the webview, choosing between dev and prod.
 */
export function getHtmlForWebview(
	webview: vscode.Webview,
	extensionUri: vscode.Uri,
	isDevelopment: boolean,
): string {
	if (isDevelopment) {
		return getDevHtml(webview, extensionUri)
	}
	return getProdHtml(webview, extensionUri)
}

/**
 * Generates the HTML for development mode (connecting to Vite dev server).
 */
function getDevHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
	const nonce = getNonce()
	// Path to codicons from the extension's node_modules
	const codiconUri = webview.asWebviewUri(
		vscode.Uri.joinPath(
			extensionUri,
			'node_modules',
			'@vscode',
			'codicons',
			'dist',
			'codicon.css',
		),
	)

	// Allow connections to the Vite dev server, including WebSockets for HMR.
	const connectSrc = `${DEV_WEBVIEW_URL} ws://localhost:5173`

	// CSP for development: Allow inline styles/scripts and connections to the dev server.
	const csp = [
		`default-src 'none'`,
		`font-src ${DEV_WEBVIEW_URL} data: ${webview.cspSource}`, // Allow fonts from dev server and VS Code
		`connect-src ${connectSrc}`, // Allow connections to dev server and WS
		`img-src ${DEV_WEBVIEW_URL} https: data:`, // Allow images from dev server, https, data URIs
		`script-src 'unsafe-eval' 'unsafe-inline' ${DEV_WEBVIEW_URL}`, // Allow inline/eval scripts from dev server for HMR
		`style-src 'unsafe-inline' ${DEV_WEBVIEW_URL} ${webview.cspSource}`, // Allow inline styles from dev server and VS Code
	].join('; ')

	return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="${codiconUri}" rel="stylesheet" id="vscode-codicon-stylesheet" />
    <meta http-equiv="Content-Security-Policy" content="${csp}">
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
      window.vscodeApi = acquireVsCodeApi()
    </script>
  </body>
</html>`
}

/**
 * Generates the HTML for production mode (using built assets).
 */
function getProdHtml(
	webview: vscode.Webview,
	extensionUri: vscode.Uri,
): string {
	const nonce = getNonce()
	const cspSource = webview.cspSource

	// Paths to built assets
	const scriptUri = webview.asWebviewUri(
		vscode.Uri.joinPath(
			extensionUri,
			'dist',
			'webview-ui',
			'assets',
			'index.js',
		),
	)
	const styleUri = webview.asWebviewUri(
		vscode.Uri.joinPath(
			extensionUri,
			'dist',
			'webview-ui',
			'assets',
			'index.css',
		),
	)

	// Path to codicons from built assets
	const codiconUri = webview.asWebviewUri(
		vscode.Uri.joinPath(
			extensionUri,
			'dist',
			'webview-ui',
			'assets',
			'codicon.css',
		),
	)

	// CSP for production: More restrictive
	const csp = [
		`default-src 'none'`,
		`font-src ${cspSource}`, // Only allow fonts from VS Code source
		`img-src ${cspSource} https: data:`, // Allow images from VS Code source, https, data URIs
		`script-src 'nonce-${nonce}'`, // Only allow scripts with the specific nonce
		`style-src ${cspSource} 'unsafe-inline'`, // Allow styles from VS Code source and inline styles (check if needed)
	].join('; ')

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${codiconUri}" rel="stylesheet" id="vscode-codicon-stylesheet" />
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" type="text/css" href="${styleUri}">
  <title>Above Repo</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
  <script nonce="${nonce}">
    // Pass vscode API and nonce to the webview
    window.nonce = "${nonce}"
    window.vscodeApi = acquireVsCodeApi()
  </script>
</body>
</html>`
}

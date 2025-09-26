import * as vscode from 'vscode'
import { FileExplorerWebviewProvider } from './providers/file-explorer'
import { telemetry } from './services/telemetry'

export function activate(context: vscode.ExtensionContext) {
	console.log('Starting Overwrite extension')

	// Initialize telemetry early
	try {
		telemetry.init(context)
	} catch (e) {
		console.warn('[telemetry] init failed', e)
	}

	// Register the Webview View Provider
	const provider = new FileExplorerWebviewProvider(
		context.extensionUri,
		context,
	)
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			FileExplorerWebviewProvider.viewType,
			provider,
			{
				webviewOptions: {
					retainContextWhenHidden: true,
				},
			},
		),
	)
}

// This method is called when your extension is deactivated
export async function deactivate() {
	console.log('Deactivating Overwrite extension')
	try {
		await telemetry.shutdown()
	} catch (e) {
		console.warn('[telemetry] shutdown failed', e)
	}
}

import * as vscode from 'vscode'
import { FileExplorerWebviewProvider } from './providers/file-explorer'

export function activate(context: vscode.ExtensionContext) {
	console.log('Starting Overwrite extension')
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
export function deactivate() {
	console.log('Deactivating Overwrite extension')
}

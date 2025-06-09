// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode'
import { FileExplorerWebviewProvider } from './providers/file-explorer'
import { clearCache } from './services/token-counter'

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "aboverepo" is now active!')

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

	// Token counting is now handled via message passing in the webview provider

	// Register cache management commands for debugging
	context.subscriptions.push(
		vscode.commands.registerCommand('aboveRepo.clearTokenCache', () => {
			clearCache()
			vscode.window.showInformationMessage('Token cache cleared')
		}),
	)
}

// This method is called when your extension is deactivated
export function deactivate() {
	// ... existing code ...
}

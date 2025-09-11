import * as path from 'node:path'
import * as vscode from 'vscode'

/**
 * Resolves a path from the XML response to a vscode.Uri within the current workspace.
 * Supports:
 * - Absolute file system paths
 * - file:// URIs
 * - Workspace-relative paths (requires root workspace folder)
 * - Multi-root via optional `root` workspace folder name
 *
 * Throws if the path cannot be resolved into a workspace folder or is outside the workspace.
 */
export function resolveXmlPathToUri(
	specPath: string,
	root?: string,
): vscode.Uri {
	// Handle file:// URIs directly
	if (specPath.startsWith('file://')) {
		const uri = vscode.Uri.parse(specPath)
		ensureInsideWorkspace(uri)
		return uri
	}

	// Absolute path
	if (path.isAbsolute(specPath)) {
		const uri = vscode.Uri.file(specPath)
		ensureInsideWorkspace(uri)
		return uri
	}

	// Workspace-relative
	const folders = vscode.workspace.workspaceFolders
	if (!folders || folders.length === 0) {
		throw new Error(`No workspace is open. Cannot resolve path: ${specPath}`)
	}

	let targetFolder: vscode.WorkspaceFolder | undefined
	if (root) {
		targetFolder = folders.find((f) => f.name === root)
		if (!targetFolder) {
			throw new Error(
				`Workspace root "${root}" not found. Available: ${folders
					.map((f) => f.name)
					.join(', ')}`,
			)
		}
	} else if (folders.length === 1) {
		targetFolder = folders[0]
	} else {
		// Attempt heuristic: allow prefix like "rootName:relative/path"
		const colonIdx = specPath.indexOf(':')
		if (colonIdx > 0) {
			const rootName = specPath.slice(0, colonIdx)
			const rel = specPath.slice(colonIdx + 1)
			const folder = folders.find((f) => f.name === rootName)
			if (folder) {
				const uri = vscode.Uri.joinPath(folder.uri, normalizeRelative(rel))
				ensureInsideWorkspace(uri)
				return uri
			}
		}
		throw new Error(
			`Ambiguous workspace path "${specPath}". Provide a root attribute or use "<rootName>:<relative/path>" format.`,
		)
	}

	const normalized = normalizeRelative(specPath)
	const uri = vscode.Uri.joinPath(targetFolder.uri, normalized)
	ensureInsideWorkspace(uri)
	return uri
}

function normalizeRelative(p: string): string {
	// Only trim leading "./" or ".\\" (not bare dotfiles like ".env") and convert backslashes to slashes
	const withoutLeadingDotSlash = p.replace(/^[.]\//, '').replace(/^[.]\\/, '')
	const posix = withoutLeadingDotSlash.replace(/\\/g, '/')
	return posix
}

function ensureInsideWorkspace(uri: vscode.Uri): void {
	const folders = vscode.workspace.workspaceFolders
	if (!folders) return
	const inFolder = folders.some(
		(f) =>
			uri.fsPath.startsWith(f.uri.fsPath + path.sep) ||
			uri.fsPath === f.uri.fsPath,
	)
	if (!inFolder) {
		throw new Error(`Path is outside the current workspace: ${uri.fsPath}`)
	}
}

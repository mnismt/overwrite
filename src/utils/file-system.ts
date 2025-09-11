import * as path from 'node:path' // Still needed for path.relative and path.join for ignore patterns
import * as os from 'node:os'
import * as fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import ignore from 'ignore'
import * as vscode from 'vscode'
import type { VscodeTreeItem } from '../types'

// Define icons for files and folders (can be customized further)
const FOLDER_ICONS = {
	branch: 'folder', // Codicon for closed folder
	leaf: 'file', // Codicon for file
	open: 'folder-opened', // Codicon for opened folder
}

const FILE_ICONS = {
    branch: 'file', // Placeholder, not typically used for files by tree components
    leaf: 'file', // Codicon for file
    open: 'file', // Placeholder, not typically used for files by tree components
}

// Expand common shell-style tokens in paths from git config (e.g., '~/.config/git/ignore').
function resolveExcludesPath(input: string): string {
    let p = input.trim()
    if (p.startsWith('~')) {
        p = path.join(os.homedir(), p.slice(1))
    }
    // Expand $HOME or $USERPROFILE
    p = p.replace(/\$(HOME|USERPROFILE)/g, (_m, name) => {
        const env = process.env[String(name)]
        return env ? env : _m
    })
    // Expand Windows-style %VAR%
    p = p.replace(/%([^%]+)%/g, (_m, name) => {
        const env = process.env[name]
        return env ? env : _m
    })
    // Remove surrounding quotes if present without tricky escaping
    if (p.length >= 2) {
        const first = p.charCodeAt(0)
        const last = p.charCodeAt(p.length - 1)
        // 34 = '"', 39 = '\''
        if ((first === 34 && last === 34) || (first === 39 && last === 39)) {
            p = p.slice(1, -1)
        }
    }
    return path.resolve(p)
}

/**
 * Recursively reads a directory using vscode.workspace.fs and builds a tree structure.
 * @param currentUri The URI of the directory to read.
 * @param rootUri The URI of the workspace root for this directory (for .gitignore path relativity).
 * @param excludedDirs An array of additional directory patterns to exclude (like .gitignore patterns).
 * @param ign The ignore object from the 'ignore' package for .gitignore rules.
 * @param userIgnore The ignore object from the 'ignore' package for user-defined excluded patterns.
 * @returns A promise that resolves to an array of VscodeTreeItem objects.
 */
async function readDirectoryRecursiveForRoot(
	currentUri: vscode.Uri,
	rootUri: vscode.Uri,
	excludedDirs: string[],
	ign: ignore.Ignore,
	userIgnore: ignore.Ignore,
): Promise<VscodeTreeItem[]> {
	const items: VscodeTreeItem[] = []

	try {
		const entries = await vscode.workspace.fs.readDirectory(currentUri)

		// Sort entries: directories first, then alphabetically by name
		const sortedEntries = entries.sort((a, b) => {
			if (
				a[1] === vscode.FileType.Directory &&
				b[1] !== vscode.FileType.Directory
			)
				return -1
			if (
				a[1] !== vscode.FileType.Directory &&
				b[1] === vscode.FileType.Directory
			)
				return 1
			return a[0].localeCompare(b[0])
		})

		for (const [name, type] of sortedEntries) {
			const entryUri = vscode.Uri.joinPath(currentUri, name)
			const relativePathForIgnore = path.relative(
				rootUri.fsPath,
				entryUri.fsPath,
			)

			// Check .gitignore
			if (ign.ignores(relativePathForIgnore)) {
				continue
			}

			// Check user-defined excluded patterns
			if (userIgnore.ignores(relativePathForIgnore)) {
				continue
			}

			const item: VscodeTreeItem = {
				label: name,
				value: entryUri.toString(), // Use full URI string as the value
				// icons: type === vscode.FileType.Directory ? FOLDER_ICONS : { leaf: 'file' }, // Simplified, vscode-tree might handle this
			}

			if (type === vscode.FileType.Directory) {
				item.icons = FOLDER_ICONS // Apply folder icons
				const subItems = await readDirectoryRecursiveForRoot(
					entryUri,
					rootUri,
					excludedDirs,
					ign,
					userIgnore,
				)
				if (subItems.length > 0) {
					item.subItems = subItems
				}
			} else if (type === vscode.FileType.File) {
				item.icons = FILE_ICONS // Apply file icon
			}
			// Symlinks and Unknown types are currently ignored but could be handled

			items.push(item)
		}
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		console.error(
			`Error reading directory ${currentUri.fsPath}: ${errorMessage}`,
		)
		// Optionally, inform the user if a specific directory is unreadable
		// vscode.window.showWarningMessage(`Could not read directory: ${currentUri.fsPath}`);
	}

	return items
}

/**
 * Gets the file tree structure for all workspace folders, respecting .gitignore for each.
 * @param excludedDirs An array of additional directory names to exclude globally.
 * @returns A promise that resolves to an array of VscodeTreeItem objects, where each top-level item is a workspace root.
 */
export async function getWorkspaceFileTree(
    excludedDirs: string[],
    options?: { useGitignore?: boolean },
): Promise<VscodeTreeItem[]> {
	const workspaceFolders = vscode.workspace.workspaceFolders
	if (!workspaceFolders || workspaceFolders.length === 0) {
		vscode.window.showInformationMessage('No workspace folder open.')
		return []
	}

	const allRootItems: VscodeTreeItem[] = []

	const useGitignore = options?.useGitignore !== false

	for (const folder of workspaceFolders) {
        const rootUri = folder.uri
        const rootFsPath = rootUri.fsPath

        // Build a comprehensive ignore rule set similar to Git's behavior:
        // - project .gitignore
        // - .git/info/exclude
        // - user's global excludes file (core.excludesFile), if available
        // The logic is best-effort and silently skips files that aren't present.
        const allIgnoreLines: string[] = []

        if (useGitignore) {
            // 1) Project .gitignore (root)
            const gitignorePath = path.join(rootFsPath, '.gitignore')
            try {
                const bytes = await vscode.workspace.fs.readFile(
                    vscode.Uri.file(gitignorePath),
                )
                const content = Buffer.from(bytes).toString('utf8')
                allIgnoreLines.push(...content.split(/\r?\n/))
            } catch {
                // No .gitignore at repo root; ignore quietly
            }

            // 2) Repo-specific excludes: .git/info/exclude
            const repoExcludePath = path.join(rootFsPath, '.git', 'info', 'exclude')
            try {
                const content = fs.readFileSync(repoExcludePath, 'utf8')
                allIgnoreLines.push(...content.split(/\r?\n/))
            } catch {
                // Not present or unreadable; ignore quietly
            }

            // 3) Global excludes file as configured in Git (core.excludesFile)
            // Attempt to query Git for the actual path; if not available, try common defaults.
            try {
                const excludesPath = execFileSync('git', ['config', '--get', 'core.excludesFile'], {
                    cwd: rootFsPath,
                    encoding: 'utf8',
                    stdio: ['ignore', 'pipe', 'ignore'],
                })
                    .trim()
                if (excludesPath) {
                    const resolved = resolveExcludesPath(excludesPath)
                    if (resolved && fs.existsSync(resolved)) {
                        const content = fs.readFileSync(resolved, 'utf8')
                        allIgnoreLines.push(...content.split(/\r?\n/))
                    }
                }
            } catch {
                // Git not available or no core.excludesFile set; try common fallbacks
                const candidates = [
                    path.join(os.homedir(), '.config', 'git', 'ignore'),
                    path.join(os.homedir(), '.gitignore_global'),
                    path.join(os.homedir(), '.gitignore'),
                ]
                for (const p of candidates) {
                    try {
                        if (fs.existsSync(p)) {
                            const content = fs.readFileSync(p, 'utf8')
                            allIgnoreLines.push(...content.split(/\r?\n/))
                            break
                        }
                    } catch {
                        // keep trying others
                    }
                }
            }
        }

        let ign = ignore()
        if (allIgnoreLines.length > 0) {
            ign = ignore().add(allIgnoreLines)
        }

        // Optional: add a few extremely common fallbacks to reduce noise/perf impact
        // only when not already covered (safe, minimal defaults)
        ign.add(['.git', '.hg', '.svn'])

		// Create ignore object for user-defined excluded patterns
		const userIgnore = ignore().add(excludedDirs)

        const subItems = await readDirectoryRecursiveForRoot(
            rootUri,
            rootUri, // rootUri itself is the base for relative ignore paths
            excludedDirs,
            ign,
            userIgnore,
        )

		const rootItem: VscodeTreeItem = {
			label: folder.name, // Use workspace folder name as label
			value: rootUri.toString(), // Use root URI string as value
			icons: FOLDER_ICONS, // Root is a folder
			subItems: subItems,
			// Optionally, mark as open by default
			// open: true,
		}
		allRootItems.push(rootItem)
	}

	return allRootItems
}

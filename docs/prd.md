## PRD: Above Repo (VS Code Extension)

**1. Introduction & Goal**

The goal is to create a Visual Studio Code extension that replicates the core functionality of RepoPrompt. This extension will allow users to select files and folders from their current VS Code workspace, generate a structured XML prompt including code context and instructions for an LLM, and provide a mechanism to apply changes suggested by the LLM back to the workspace files using VS Code's APIs.

**2. Core Features**

Here are the essential features for the initial version:

**2.1. File Selection (Webview Panel - Explorer Tab)**

Status: Done

* **Requirement 2.1.1: Activate via Activity Bar:** The extension should add an icon to the VS Code Activity Bar. Clicking this icon reveals a custom view.
* **Requirement 2.1.2: Workspace File Tree View:** Display the file and folder structure of the *currently opened* VS Code workspace in the custom view using the `vscode.TreeView` API.
  * Should visually distinguish between files and folders (using standard VS Code icons).
  * Should allow expanding/collapsing folders.
  * Should ideally respect `.gitignore` and VS Code's `files.exclude` settings (or provide an option).
* **Requirement 2.1.3: File/Folder Selection:**
  * Implement checkboxes or a similar selection mechanism within the TreeView.
  * Selecting a folder should implicitly select all non-excluded files and subfolders within it. Deselecting should do the opposite.
  * Allow selecting/deselecting individual files even if their parent folder is selected/deselected.
  * The selection state must persist within the session.
* **Requirement 2.1.4: Search/Filter (Basic):** Provide a search/filter bar within the custom view to filter the files/folders displayed in the tree by name.
* **Requirement 2.1.5: Refresh Tree:** Include a refresh button in the view's toolbar to manually reload the file tree, reflecting external changes not automatically picked up by VS Code's file watcher.

**2.2. Context Building & Prompt Generation (Webview Panel - Context Tab)**

Status: In Progress

The **Context Tab** in the Webview Panel is dedicated to building the prompt for the LLM. It includes the following features:

* **Requirement 2.2.1: Selected Files Summary:** Display a simple counter showing how many files are currently selected that will be included in the context.

* **Requirement 2.2.2: User Instructions Input:**
  * Provide a `<textarea>` in the Webview Panel for the user's specific instructions (`<user_instructions>` tag content).

* **Requirement 2.2.3: Copy to Clipboard Buttons:**
  * Implement a "Copy" button: Dynamically generates and copies `<file_map>`, `<file_contents>`, and `<user_instructions>` to the clipboard when clicked.
  * Implement an "XML Copy" button: Dynamically generates and copies `<file_map>`, `<file_contents>`, `<xml_formatting_instructions>`, and `<user_instructions>` to the clipboard when clicked. 
  * Both buttons should use `vscode.env.clipboard.writeText` for the clipboard operations.
  * The actual XML content should be generated at copy time, not displayed in the UI.
* **Requirement 2.2.4: Background Processing:** The extension should still implement the logic to:
  * Generate the `<file_map>` tag containing the hierarchical structure of selected files
  * Read and format the content of each selected file for the `<file_contents>` tag
  * Include the fixed `<xml_formatting_instructions>` tag
  * These components should be generated only when copying to clipboard, not displayed in the UI.


**2.3. Applying LLM Changes (Webview Panel - Apply Tab)**

Status: Todo

The **Apply Tab** in the Webview Panel is dedicated to applying changes suggested by the LLM. It includes the following features:

* **Requirement 2.3.1: AI Response Input:** Provide a `<textarea>` in the Webview Panel for the user to paste the XML-formatted LLM response.
* **Requirement 2.3.2: Parse LLM Response:**
  * Implement logic (within the Webview or extension host) to parse the pasted XML, specifically looking for `<file>` tags and their `path` and `action` attributes.
  * Extract `<search>` and `<content>` blocks for `modify` actions.
  * Extract `<content>` blocks for `create` and `rewrite` actions.
* **Requirement 2.3.3: "Preview & Apply Changes" Button:** A button in the Webview Panel to initiate the application process. *Consider adding a preview step (e.g., using VS Code's diff view) before final application.*
* **Requirement 2.3.4: Implement File Actions using VS Code API:**
  * **`create`:** Use `vscode.workspace.fs.writeFile` to create a new file at the specified relative `path` with the provided `<content>`. Ensure the path is resolved correctly relative to the workspace root. Handle directory creation if needed.
  * **`rewrite`:** Use `vscode.workspace.fs.writeFile` to replace the entire content of the file at the specified relative `path` with the provided `<content>`.
  * **`modify`:**
    * Use `vscode.workspace.openTextDocument` and `getText` to read the target file specified by the relative `path`.
    * Find the *exact* block of text matching the `<search>` content.
    * Calculate the `vscode.Range` of the found block.
    * Create a `vscode.WorkspaceEdit` object. Use `workspaceEdit.replace(fileUri, range, content)` to stage the replacement.
    * Apply the change using `vscode.workspace.applyEdit`. This integrates with VS Code's undo/redo stack.
    * Handle errors: file not found, search block not found, multiple ambiguous matches.
  * **`delete`:** Use `vscode.workspace.fs.delete` to delete the file at the specified relative `path`. Use `{ recursive: true, useTrash: true }` options for safety.
* **Requirement 2.3.5: Feedback & Error Handling:** Provide clear feedback using VS Code notifications (`vscode.window.showInformationMessage`, `vscode.window.showWarningMessage`, `vscode.window.showErrorMessage`) and potentially status updates within the Webview Panel. Report success/failure for each action.

**3. User Interface (UI) / User Experience (UX)**

* **Integration:** Leverage standard VS Code UI components: Activity Bar, Custom TreeView, Webview Panel, Status Bar, Notifications, Command Palette.
* **Layout:**
  * **Activity Bar View:** Persistent file selection.
  * **Webview Panel (Tabs):**
    * **Explorer Tab:** Displays the file tree for selection.
    * **Context Tab:** Composes prompts for the LLM.
    * **Apply Tab:** Applies changes from the LLM.
* **Responsiveness:** Use asynchronous operations (`async/await`) for all file system access and potentially long-running tasks (parsing, context generation) to keep the UI responsive. Use `vscode.Progress` API for long operations.
* **Consistency:** Follow VS Code UI/UX guidelines.

**4. Technical Considerations**

* **Language:** TypeScript (standard for VS Code extensions).
* **Core API:** `vscode` namespace (especially `vscode.workspace`, `vscode.window`, `vscode.commands`, `vscode.Uri`, `vscode.TreeView`, `vscode.WebviewPanel`, `vscode.env`).
* **File System:** Use `vscode.workspace.fs` for basic file operations (read, write, delete) and `vscode.workspace.applyEdit` with `vscode.WorkspaceEdit` for modifications to ensure integration with editor features (undo, dirty state).
* **Webview Communication:** Use `webview.postMessage` and `extensionContext.webviewView.webview.onDidReceiveMessage` / `panel.webview.onDidReceiveMessage` for communication between the Webview UI and the extension host logic.
* **XML Parsing:** Use a reliable JavaScript/Node.js XML parsing library (e.g., `fast-xml-parser` or standard `DOMParser` within the webview).
* **State Management:** Manage the state of selected files effectively (e.g., using `extensionContext.workspaceState`).

**5. Sample XML Output**

``````xml
<file_map>
/Users/minhthanh/Work/Side/aboverepo
└── src
    ├── extension.ts
    └── fileExplorerWebviewProvider.ts

</file_map>
</sample-file-map>

<file_contents>
File: /Users/minhthanh/Work/Side/aboverepo/src/extension.ts

```ts
import * as vscode from 'vscode'
import { FileExplorerWebviewProvider } from './fileExplorerWebviewProvider'
export function activate(context: vscode.ExtensionContext) {
 console.log('Congratulations, your extension "aboverepo" is now active!')

 const provider = new FileExplorerWebviewProvider(context.extensionUri)
 context.subscriptions.push(
  vscode.window.registerWebviewViewProvider(
   FileExplorerWebviewProvider.viewType,
   provider,
  ),
 )
}
```

File: /Users/minhthanh/Work/Side/aboverepo/src/fileExplorerWebviewProvider.ts
```ts
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
```

</file_contents>

``````


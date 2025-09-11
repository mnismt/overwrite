## PRD: Overwrite (VS Code Extension)

**1. Introduction & Goal**

The goal is to create a Visual Studio Code extension that replicates the core functionality of RepoPrompt. This extension will allow users to select files and folders from their current VS Code workspace, generate a structured XML prompt including code context and instructions for an LLM, and provide a mechanism to apply changes suggested by the LLM back to the workspace files using VS Code's APIs.

**2. Core Features**

Here are the essential features for the initial version:

**2.1. Context Generation & File Selection (Webview Panel - Context Tab)**

Status: Done

The Context Tab in the Webview Panel is the primary interface for selecting files and preparing the prompt context.

- Requirement 2.1.1: Activate via Activity Bar:
  - The extension should add an icon to the VS Code Activity Bar. Clicking this icon reveals the Webview Panel, defaulting to the Context Tab.
- Requirement 2.1.2: Workspace File Tree View:
  - Display the file and folder structure of the currently opened VS Code workspace within the Context Tab using a suitable webview component (e.g., leveraging @vscode/webview-ui-toolkit or a custom implementation).
  - Should visually distinguish between files and folders.
  - Should allow expanding/collapsing folders.
  - Must ensure row action buttons do not toggle expand/collapse (clicks are captured and stopped to avoid bubbling to the tree row).
- Requirement 2.1.3: File/Folder Selection:
  - Implement checkboxes or a similar selection mechanism within the TreeView.
  - Selecting a folder should implicitly select all non-excluded files and subfolders within it. Deselecting should do the opposite.
  - Allow selecting/deselecting individual files even if their parent folder is selected/deselected.
  - The selection state must persist within the session.
- Requirement 2.1.4: Search/Filter (Basic): Provide a search/filter bar within the Context Tab to filter the files/folders displayed in the tree by name.
- Requirement 2.1.5: Refresh Tree: Include a refresh button near the search bar to manually reload the file tree, reflecting external changes.
- Requirement 2.1.6: Selected Files Summary: Display a simple counter below the tree showing how many files/folders are currently selected.
- Requirement 2.1.7: User Instructions Input:
  - Provide a <textarea> below the selected files summary for the user's specific instructions (<user_instructions> tag content).
- Requirement 2.1.8: Copy to Clipboard Buttons (sticky footer):
  - Provide two actions side by side in the footer:
    - "Copy Context" — generates <file_map>, <file_contents>, and <user_instructions> and copies to clipboard.
    - "Copy Context + XML Instructions" — also includes <xml_formatting_instructions>.
  - Both buttons use vscode.env.clipboard.writeText.
  - The XML content is generated at copy time (not displayed).
- Requirement 2.1.9: Background Processing (No UI Display): The extension host must still implement the logic to:
  - Generate the <file_map> tag (hierarchical structure).
  - Read and format the content for <file_contents>.
  - Include the fixed <xml_formatting_instructions> when requested.
- Requirement 2.1.10: Double click on the selected files in the tree view should open the file in the editor.
  - Implement a double click handler on the tree view to open the selected file in the editor.
  - Row action buttons do not toggle folder expand/collapse; clicks are captured and stopped to avoid bubbling to the tree row.
- Requirement 2.1.11: Count and display token usage and surface a compact summary.
  - When a file is selected, count tokens per file and show counts in the tree (folders show summed counts).
  - The Context tab layout pins the User Instructions at the top and a footer at the bottom; only the file tree scrolls.
  - The footer shows a compact token summary (files, instructions, total, total+XML) and contains two actions side by side: “Copy Context” and “Copy Context + XML Instructions”.
- Requirement 2.1.12: Preserve the selection state when the webview is reopened.
  - When the webview is reopened, it should restore the previously selected files (use retainContextWhenHidden option in the webview options)
- Requirement 2.1.13: Multi-Root Workspace Support.
  - The extension must correctly handle VS Code workspaces with multiple root folders.
  - File Tree: The TreeView in the Context Tab should display a clear separation or grouping for each root folder in the workspace. For example, each root folder could be a top-level expandable item.
  - Path Resolution: All file paths (for selection, context generation, and applying changes) must be resolved correctly relative to their respective workspace folder. The generated <file_map> and <file> paths in the XML should reflect this, possibly by prefixing paths with the root folder name or using a scheme that uniquely identifies the root.
  - File Operations: All vscode.workspace.fs operations and vscode.workspace.applyEdit must target files within the correct workspace folder.
  - Selection Persistence: The selection state should be maintained correctly across multiple roots.
  - Search/Filter: The search/filter functionality should apply across all root folders
- Requirement 2.1.14: Allow exclude/include folder pattern (deprecated, moved to Setting Tab in requirement 2.3.0)
  - The extension should support a textarea below the user instructions textarea to allow the user to input the exclude folder pattern.
  - The exclude folder pattern is a simple text file with one pattern per line, similar to the .gitignore file, which is used to exclude files and folders from the file tree.
  - The include folder pattern is a simple text file with one pattern per line, similar to the .gitignore file, which is used to always include files and folders from the file tree after a refresh.

**2.2. Applying LLM Changes (Webview Panel - Apply Tab)**

Status: Done

The Apply Tab in the Webview Panel is dedicated to applying changes suggested by the LLM.

- Requirement 2.2.1: AI Response Input: Provide a <textarea> in the Webview Panel for the user to paste the XML-formatted LLM response.
- Requirement 2.2.2: Parse LLM Response:
  - Implement logic (within the Webview or extension host) to parse the pasted XML, specifically looking for <file> tags and their path and action attributes.
  - Extract <search> and <content> blocks for modify actions.
  - Extract <content> blocks for create and rewrite actions.
- Requirement 2.2.3: Separate Preview and Apply Actions:
  - Preview: Opens native VS Code diffs without saving, comparing current workspace files to the computed “after” content from the XML.
    - Implementation notes: use `vscode.workspace.openTextDocument({ content })` to create in‑memory documents and execute `vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title)`.
    - Behaviors per action:
      - create: diff empty (left) → new content (right).
      - rewrite: original file (left; if missing, empty) → new content (right).
      - modify: original (left) → modified (right).
      - delete: original (left; if missing, empty) → empty (right).
      - rename: show a preview notification of the rename plan.
  - Apply: Writes changes to disk using VS Code APIs (see 2.2.4). Preview and Apply are independent; users may do either in any order.
- Requirement 2.2.4: Implement File Actions using VS Code API:
  - create: Use vscode.workspace.fs.writeFile to create a new file at the specified path with the provided <content>. Ensure directory creation if needed.
  - rewrite: Use vscode.workspace.fs.writeFile to replace the entire content of the file at the specified path with the provided <content>.
  - modify:
    - Use vscode.workspace.openTextDocument and getText to read the target file.
    - Find the exact block of text matching the <search> content (respect optional <occurrence> first | last | N).
    - Calculate the vscode.Range of the found block.
    - Create a vscode.WorkspaceEdit and use workspaceEdit.replace(fileUri, range, content) to stage the replacement.
    - Apply the change using vscode.workspace.applyEdit (undo/redo integration).
    - Handle errors: file not found, search block not found, multiple ambiguous matches.
  - delete: Use vscode.workspace.fs.delete to delete the file at the specified path. Use { recursive: true, useTrash: true } options for safety.
- Requirement 2.2.5: Feedback & Error Handling: Provide clear feedback via VS Code notifications and status updates within the Webview. Report success/failure for each action. For Preview, surface parse errors to the Apply tab and open no diffs.

**2.3. Setting (Webview Panel - Setting Tab)**

Status: In Progress

The setting tab in the webview panel is dedicated to setting the extension.

- Requirement 2.3.0: Move the Excluded folders textarea to the Setting Tab (Requirement 2.1.14)
- Requirement 2.3.1: Support reading .gitignore (checkbox)
- Requirement 2.3.2: Support enable/disable token usages per file

**3. User Interface (UI) / User Experience (UX)**

- Integration: Leverage standard VS Code UI components: Activity Bar, Webview Panel, Status Bar, Notifications, Command Palette.
- Layout:
  - Webview Panel (Tabs):
    - Context Tab: Combines file exploration/selection and context/instruction building.
    - Apply Tab: Applies changes from the LLM.
- Responsiveness: Use asynchronous operations (async/await) for all file system access and potentially long-running tasks (parsing, context generation) to keep the UI responsive. Use vscode.Progress API for long operations.
- Consistency: Follow VS Code UI/UX guidelines.

**4. Technical Considerations**

- Language: TypeScript (standard for VS Code extensions).
- Core API: vscode namespace (especially vscode.workspace, vscode.window, vscode.commands, vscode.Uri, vscode.TreeView, vscode.WebviewPanel, vscode.env).
- File System: Use vscode.workspace.fs for basic file operations (read, write, delete) and vscode.workspace.applyEdit with vscode.WorkspaceEdit for modifications to ensure integration with editor features (undo, dirty state).
- Webview Communication: Use webview.postMessage and extensionContext.webviewView.webview.onDidReceiveMessage / panel.webview.onDidReceiveMessage for communication between the Webview UI and the extension host logic.
- XML Parsing: Use a reliable JavaScript/Node.js XML parsing library (e.g., fast-xml-parser or standard DOMParser within the webview).
- State Management: Manage the state of selected files effectively (e.g., using extensionContext.workspaceState).

**5. Sample XML Output**

``````xml
<file_map>
/Users/minhthanh/Work/Side/overwrite
└── src
    ├── extension.ts
    └── fileExplorerWebviewProvider.ts

</file_map>
</sample-file-map>

<file_contents>
File: /Users/minhthanh/Work/Side/overwrite/src/extension.ts

```ts
import * as vscode from 'vscode'
import { FileExplorerWebviewProvider } from './fileExplorerWebviewProvider'
export function activate(context: vscode.ExtensionContext) {
 console.log('Congratulations, your extension "overwrite" is now active!')

 const provider = new FileExplorerWebviewProvider(context.extensionUri)
 context.subscriptions.push(
  vscode.window.registerWebviewViewProvider(
   FileExplorerWebviewProvider.viewType,
   provider,
  ),
 )
}
```

File: /Users/minhthanh/Work/Side/overwrite/src/fileExplorerWebviewProvider.ts
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

**6. Updates**

- Tests: Added unit tests for file-explorer (RowActions, MiniActionButton, RowDecorations, TreeNode, FileExplorer selection flows).
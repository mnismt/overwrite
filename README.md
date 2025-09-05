# Overwrite README

**Overwrite** is a Visual Studio Code extension inspired by RepoPrompt. It helps you select files and folders from your workspace, build structured XML prompts for Large Language Models (LLMs) including code context, and apply LLM-suggested changes back to your local files.

## Features

Overwrite integrates directly into your VS Code workflow with a dedicated view in the Activity Bar.

**1. File Selection (Explorer Tab)**

*   **Visual File Tree:** Browse your workspace files and folders in a familiar tree structure within the Overwrite Webview Panel.
*   **Flexible Selection:** Select individual files or entire folders. Folder selection implicitly includes all nested files and subfolders (respecting common exclusion settings like `.gitignore` and `node_modules`).
*   **Search & Filter:** Quickly find specific files or folders using the integrated search bar.
*   **Refresh:** Manually update the file tree to reflect external changes.

**2. Context Building & Prompt Generation (Context Tab)**

*   **Selected Files Summary:** See a clear list of files currently selected for inclusion in the prompt.
*   **Automatic XML Generation:**
    *   Generates a `<file_map>` showing the hierarchical structure of selected items.
    *   Generates `<file_contents>` containing the full code of selected files, clearly marked with their paths.
*   **User Instructions:** Add your specific instructions for the LLM in a dedicated text area (`<user_instructions>`).
*   **Prompt Management:** Save frequently used instructions as named prompts, easily select and reuse them, and delete prompts you no longer need.
*   **XML Formatting Instructions:** Includes the necessary `<xml_formatting_instructions>` required by some LLMs for structured input/output.
*   **Copy Options:**
    *   **Copy:** Copies the file map, file contents, and user instructions to the clipboard.
    *   **XML Copy:** Copies the file map, file contents, user instructions, *and* the XML formatting instructions to the clipboard.
*   **Token Estimation (Optional):** Provides an estimated token count for the generated context.

**3. Applying LLM Changes (Apply Tab)**

*   **Paste Response:** Paste the XML-formatted response from your LLM directly into the Apply tab.
*   **Parse & Preview:** Parses the response, identifying file actions (`create`, `rewrite`, `modify`, `delete`) specified within `<file>` tags. (Preview functionality is planned).
*   **Apply Changes:** Executes the identified file actions using VS Code APIs, integrating with features like undo/redo and source control.
    *   Supports creating new files, rewriting existing ones, modifying specific code blocks (using `<search>` and `<content>`), and deleting files.
*   **Feedback:** Provides notifications on the success or failure of applying changes.

## How to Use

1.  Click the **Overwrite icon** in the VS Code Activity Bar to open the view.
2.  Use the **Explorer Tab** to navigate and select the files and folders you want to include as context.
3.  Switch to the **Context Tab**.
    *   Review the selected files.
    *   Enter your specific task instructions in the "User Instructions" text area.
    *   (Optional) Save your instructions as a named prompt for later use.
    *   Click **"Copy"** or **"XML Copy"** to copy the generated prompt to your clipboard.
4.  Paste the prompt into your preferred LLM.
5.  Once you receive the XML-formatted response from the LLM, switch to the **Apply Tab**.
6.  Paste the response into the text area.
7.  Click **"Preview & Apply Changes"** (or similar) to apply the suggested modifications to your workspace.

## Requirements

*   Visual Studio Code version 1.85.0 or higher.
*   A workspace/folder opened in VS Code.

## Extension Settings

This extension does not currently contribute any specific VS Code settings.

## Known Issues

*   No known issues at this time. Please report any bugs or unexpected behavior on the project's issue tracker (link to be added).

## Release Notes

### 0.0.1

*   Initial release.
*   Features:
    *   Activity Bar entry.
    *   Webview Panel with Explorer, Context, and Apply tabs.
    *   File tree display with selection (using vscode-elements tree).
    *   Basic file exclusion (`.git`, `node_modules`, etc.).
    *   Refresh and search functionality in Explorer tab.
    *   Placeholder content for Context and Apply tabs.
    *   Basic PRD documentation setup.

---

## Technical Stack

*   **Language:** TypeScript
*   **Framework:** VS Code Extension API
*   **UI Components:** VSCode Elements (`vscode-tree`, `vscode-tabs`, etc.)
*   **Package Manager:** PNPM

## Contributing & Feedback

Contributions and feedback are welcome! Please refer to the project repository (link to be added) for contribution guidelines and issue tracking.

**Enjoy!**

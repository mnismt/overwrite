# Overwrite

![Overwrite logo](resources/overwrite-logo.png)

A concise VS Code extension to build high‑quality XML prompts from selected workspace files and apply LLM‑suggested changes back to your code.

## Features

- Explorer
  - Select files/folders with search and refresh; double‑click to open files.
  - Token counting per file and folder rollups; multi‑root workspaces supported.
- Context
  - Copy XML with <file_map>, <file_contents>, <user_instructions>, optionally <xml_formatting_instructions>.
  - Context is generated on copy (no heavy UI rendering).
- Apply
  - Paste LLM XML and preview diffs (create/modify/rewrite/delete/rename) before applying.
  - Apply safely via VS Code APIs with undo/redo and clear error feedback.
- Settings
  - Excluded folders editor and optional .gitignore support (in progress).

## How to use

1. Open Overwrite from the Activity Bar.
2. In Explorer/Context, pick files and add your task instructions.
3. Click Copy Context (or Copy Context + XML Instructions) and paste into your LLM.
4. Paste the LLM XML response into Apply, preview diffs, then apply.

## Requirements

- VS Code 1.85.0+

# AGENTS

This file provides guidance when working with code in this repository.

## Project Overview

Overwrite is a Visual Studio Code extension that helps users select files and folders from their workspace, build structured XML prompts for Large Language Models (LLMs), and apply LLM-suggested changes back to local files. The extension provides a webview-based interface with tabs for file exploration, context building, and applying changes.

## Development Commands

### Essential Commands

- `pnpm compile` - Compile TypeScript to JavaScript
- `pnpm watch` - Watch for changes and compile automatically
- `pnpm lint` - Run Biome linter to check and fix code style
- `pnpm test` - Run extension tests (compiles, lints, then runs tests)
- `pnpm check-types` - Type check without emitting files
- `pnpm package` - Create production package (includes webview build)
- `pnpm vscode:package` - Create .vsix extension package

### Development Workflow

1. Make changes to TypeScript files in `src/`
2. Run `pnpm watch` to compile automatically during development
5. Use `pnpm package` for production builds

## Architecture Overview

### Core Structure

The extension follows a strict frontend-backend architecture:

**Extension Host (Backend):**

- `src/extension.ts` - Main entry point, registers webview provider
- `src/providers/file-explorer/` - Core webview provider and message handling
- `src/services/` - Backend services (token counting, etc.)
- `src/utils/` - Utility functions for file system, XML parsing
- `src/prompts/` - XML prompt generation logic

**Webview UI (Frontend):**

- `src/webview-ui/` - React 19 application with TypeScript
- Uses `@vscode-elements/elements` for VS Code-native UI components
- Separate package.json with its own build system (Vite)

### Communication Architecture

**CRITICAL:** Webview and extension communicate exclusively through message passing. NEVER use `vscode.commands.executeCommand()` directly in the webview.

**Webview → Extension:**

- Use `getVsCodeApi().postMessage()` from `src/webview-ui/src/utils/vscode.ts`
- Messages handled in `src/providers/file-explorer/index.ts`

**Extension → Webview:**

- Use `this._view.webview.postMessage()` in webview provider
- Messages handled in `src/webview-ui/src/App.tsx`

### Key Components

**File Explorer Provider** (`src/providers/file-explorer/index.ts`):

- Manages webview lifecycle and message handling
- Handles file tree generation and caching
- Processes token counting requests
- Manages excluded folders state

**Webview UI** (`src/webview-ui/src/`):

- Three main tabs: Explorer, Context, Apply
- React components using VS Code elements
- Token counting integration
- XML response parsing and application

**Settings Tab** (`src/webview-ui/src/components/settings-tab/`):

- Form-based UI for user preferences (currently “Excluded Folders”).
- Uses a native `<form>` with a single submit handler, a `draft` state object, and dirty tracking.
- Fields expose `name` and accessible labeling; avoid setting `form` attribute on `<vscode-button>` (use `type="submit"`).

**Services** (`src/services/`):

- `token-counter.ts` - Token estimation using js-tiktoken
- Caching mechanism for performance

## Important Development Notes

### File Naming Convention

- All files must use kebab-case (e.g., `context-tab.tsx`, `file-system.ts`)
- This maintains consistency for URLs and imports

### VS Code Elements Integration

- Use `@vscode-elements/elements` components directly in JSX
- Type definitions in `src/webview-ui/src/global.d.ts`
- In React, use `className` and `htmlFor` on web components — React maps them to `class` and `for` at runtime. This matches our typings in `global.d.ts` (use `className`, not `class`).
- Custom events use `on`-prefixed props (e.g., `onvsc-tabs-select`)

### Message Passing Patterns

- Always use request IDs for request-response flows
- Implement timeout mechanisms for webview requests
- All message commands must be registered in `App.tsx` to prevent warnings

### Testing

- Webview tests (preferred for verification): `pnpm -C src/webview-ui test --run`
- Runs Vitest against the React webview UI.
- Use this command when verifying functionality in this repo.
- Backend/extension tests are located in `src/test/suite/` and use Mocha with the VS Code runner.
- Do not run backend/VS Code-side tests as part of routine verification in this environment.

### Build Process

- Main extension: ESBuild (configured in `esbuild.js`)
- Webview UI: Vite (separate build in `src/webview-ui/`)
- Production builds include webview assets in `dist/webview-ui/`

## Configuration Files

### Biome Configuration (`biome.json`)

- Code formatter and linter
- Uses 2 spaces for indentation
- Single quotes for JavaScript
- Specific rules disabled for VS Code extension development

### TypeScript Configuration

- Main project: `tsconfig.json` (excludes webview-ui)
- Webview UI: Separate TypeScript config in `src/webview-ui/`

### Package Management

- Uses PNPM as package manager
- Webview UI has its own package.json and dependencies

### Tailwind CSS in Webview UI

- Tailwind v4 is used in `src/webview-ui`. Import once in [`src/webview-ui/src/index.css`](src/webview-ui/src/index.css) via `@import 'tailwindcss';`.
- VS Code theme tokens are mapped to Tailwind colors using `@theme` in that file:
  - Examples: `--color-fg`, `--color-bg`, `--color-muted`, `--color-error`, `--color-button`, `--color-button-hover`, `--color-button-foreground`, `--color-warn-bg`, `--color-warn-border`.
  - Use utilities like `text-fg`, `text-muted`, `text-error`, `bg-bg`, `bg-warn-bg`, `border-warn-border`, etc.
- Prefer Tailwind utilities over inline styles for layout/spacing; keep inline styles only where dynamic token logic is needed.

## When you need to call tools from the shell, use this rubric

When you need to call tools from the shell, use this rubric:

- Find files: `fd`
- Find text: `rg` (ripgrep)
- Find code structure (TS/TSX): `ast-grep`
  - Default to TypeScript:
    - `.ts`: `ast-grep --lang ts -p '<pattern>'`
    - `.tsx` (React): `ast-grep --lang tsx -p '<pattern>'`
  - For other languages, set `--lang` appropriately (e.g., `--lang rust`)
- Select among matches: pipe to `fzf`
- JSON: `jq`
- YAML/XML: `yq`

## Webview Verification (Playwright MCP)

When you change anything in `src/webview-ui/`, verify behavior using Playwright MCP against the always-running dev server. The webview boots with a mocked VS Code API so you can exercise flows without the extension host.

- Open the app
  - Navigate with Playwright MCP to `http://localhost:5173/`.
  - The mock API lives at `src/webview-ui/src/utils/mock.ts` and provides deterministic data (file tree, excluded folders, token counts). No real filesystem operations occur.

- Basic smoke steps
  - Switch tabs via role selectors, e.g., `page.getByRole('tab', { name: 'Settings' }).click()`.
  - Interact with inputs and buttons using role-based queries; verify state changes (disabled/enabled, text content) and UI feedback.
  - Example (Settings): type into the Excluded Folders textarea, confirm the `Save` button enables, click Save, observe the transient “Settings saved” indicator, and ensure the button disables again.

- File tree checks
  - The Context tab shows the mock file tree generated in `buildMockFileTree()` inside `mock.ts`.
  - After saving settings that affect exclusions, the UI posts `getFileTree` and refreshes using the mock; validate the message flow only (no real files change).

- Console noise
  - You may see VS Code Elements warnings about codicons in dev; these are expected in the browser playground.

- Do not use `vscode.commands` in the webview; all extension interactions occur via `getVsCodeApi().postMessage()` and are handled in `src/providers/file-explorer/index.ts`.

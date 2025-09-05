# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
3. Run `pnpm lint` to ensure code quality
4. Run `pnpm test` to verify functionality
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
- Use standard HTML attributes (`class`, `for`) for web components
- Custom events use `on`-prefixed props (e.g., `onvsc-tabs-select`)

### Message Passing Patterns
- Always use request IDs for request-response flows
- Implement timeout mechanisms for webview requests
- All message commands must be registered in `App.tsx` to prevent warnings

### Testing
- Tests located in `src/test/suite/`
- Uses Mocha with VS Code test runner
- Run with `pnpm test` (includes compilation and linting)

### Build Process
- Main extension: ESBuild (configured in `esbuild.js`)
- Webview UI: Vite (separate build in `src/webview-ui/`)
- Production builds include webview assets in `dist/webview-ui/`

## Configuration Files

### Biome Configuration (`biome.json`)
- Code formatter and linter
- Uses tabs for indentation
- Single quotes for JavaScript
- Specific rules disabled for VS Code extension development

### TypeScript Configuration
- Main project: `tsconfig.json` (excludes webview-ui)
- Webview UI: Separate TypeScript config in `src/webview-ui/`

### Package Management
- Uses PNPM as package manager
- Webview UI has its own package.json and dependencies

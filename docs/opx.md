# OPX v1: Overwrite Patch XML — Product Requirements Document (PRD)

## Summary

OPX is an original XML-based change protocol for Overwrite that LLMs produce and the extension applies to the workspace.

Operations supported:

- Create files
- Patch specific regions of files (search-and-replace)
- Replace entire files
- Remove files
- Move/rename files

## Goals

- Replace the existing immediately with a new, original protocol.
- Keep the format minimal and highly reliable for LLMs to generate.
- Map OPX operations directly onto our existing apply engine with no behavior changes beyond parsing.

## Non‑Goals

- No phased rollout or legacy compatibility.
- No telemetry changes.
- No new runtime dependencies.

---

## Protocol Specification

### Top-level

- One or more `<edit>` elements may appear at the top level.
- Optionally, edits may be wrapped in a single `<opx>...</opx>` container. The container is ignored by the parser.

### Edit element

Element: `<edit>`
- Required attributes:
  - `file`: path to the target file (prefer workspace-relative)
  - `op`: operation type (see below)
- Optional attributes:
  - `root`: VS Code workspace root folder name for multi-root workspaces

Supported `op` values and semantics:
- `new` — create a new file. Requires a `<put>` child.
- `patch` — search-and-replace a region. Requires both `<find>` and `<put>` children.
- `replace` — replace entire file contents. Requires a `<put>` child.
- `remove` — delete file. No children required.
- `move` — rename/move file. Requires a `<to file="..."/>` child.

### Children of `<edit>`

- `<why>` (optional): A brief sentence describing the change for this edit.
- `<find>` (for `op="patch"`):
  - Optional attribute: `occurrence="first|last|N"` to disambiguate repeated matches.
  - Contains a literal block delimited by `<<<` (start) and `>>>` (end) on their own lines.
- `<put>` (for `op="new"`, `op="patch"`, `op="replace"`):
  - Contains a literal block delimited by `<<<` and `>>>` on their own lines.
- `<to file="..."/>` (for `op="move"`):
  - Self-closing element with a required `file` attribute specifying destination path.

### Literal content blocks

- Inside `<find>` and `<put>`, the payload must be wrapped between lines containing only `<<<` and `>>>`.
- The parser takes all text strictly between those markers. Surrounding whitespace/newlines around markers are trimmed.

### Path rules

- Prefer workspace-relative paths (e.g., `src/lib/logger.ts`).
- `file://` URIs and absolute paths are tolerated but not required.
- Do not reference paths outside the workspace.

### Examples

New file
```xml
<edit file="src/utils/strings.ts" op="new">
  <why>Create utility module</why>
  <put>
<<<
export function titleCase(s: string): string {
  return s.split(/\s+/).map(w => w ? w[0]!.toUpperCase() + w.slice(1) : w).join(' ')
}
>>>
  </put>
</edit>
```

Patch region
```xml
<edit file="src/api/users.ts" op="patch">
  <why>Add timeout and error logging</why>
  <find occurrence="first">
<<<
export async function fetchUser(id: string) {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}
>>>
  </find>
  <put>
<<<
async function withTimeout<T>(p: Promise<T>, ms = 10000): Promise<T> {
  const t = new Promise<never>((_, r) => setTimeout(() => r(new Error('Request timed out')), ms));
  return Promise.race([p, t]);
}

export async function fetchUser(id: string) {
  try {
    const res = await withTimeout(fetch(`/api/users/${id}`), 10000);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  } catch (err) {
    console.error('[api] fetchUser error', err);
    throw err;
  }
}
>>>
  </put>
</edit>
```

Replace entire file
```xml
<edit file="src/config/index.ts" op="replace">
  <put>
<<<
export interface AppConfig {
  apiBaseUrl: string;
  enableTelemetry: boolean;
  maxConcurrentJobs: number;
}

export const config: AppConfig = {
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
  enableTelemetry: process.env.TELEMETRY === '1',
  maxConcurrentJobs: Number(process.env.MAX_JOBS || 4),
};
>>>
  </put>
</edit>
```

Remove file
```xml
<edit file="tests/legacy/user-auth.spec.ts" op="remove" />
```

Move / rename file
```xml
<edit file="src/lib/flags.ts" op="move">
  <to file="src/lib/feature-flags.ts" />
</edit>
```

---

## Architecture Changes (Immediate)

All changes below are applied at once to switch the system fully to OPX v1.

### Parser — OPX only

File: [src/utils/xml-parser.ts](file:///Users/minhthanh/Work/Side/overwrite/src/utils/xml-parser.ts)

- Remove legacy parsing and markers; accept only OPX tags.
- New parse path:
  - Accept either top-level `<edit>` elements or a single `<opx>` wrapper containing `<edit>` elements.
  - For each `<edit>`:
    - Read attributes `file`, `op`, optional `root`.
    - `op -> action` mapping:
      - `new` → `create`
      - `patch` → `modify`
      - `replace` → `rewrite`
      - `remove` → `delete`
      - `move` → `rename`
    - For `patch`: extract `<find>` (with optional `occurrence`) and `<put>` blocks.
    - For `new|replace`: extract `<put>` block.
    - For `move`: read `<to file="..."/>` into `newPath`.
  - Literal extraction uses `<<<`/`>>>` only.
- Return the same `ParseResult` and `FileAction[]` types used by the apply engine.

### Preprocessor (Apply tab)

File: [src/webview-ui/src/components/apply-tab/preprocess.ts](file:///Users/minhthanh/Work/Side/overwrite/src/webview-ui/src/components/apply-tab/preprocess.ts)

- Extend normalization to `<edit ...>` and `<to .../>` tags (lowercase keys, normalize quotes).
- Remove legacy tag handling (`<file>`, `<new/>`, etc.).
- Lint rules:
  - `<edit>` must include `file` and `op`.
  - `op="patch"` requires both `<find>` and `<put>`.
  - `op="move"` requires `<to file="..."/>`.

### Apply Pipeline (no changes)

File: [src/providers/file-explorer/file-action-handler.ts](file:///Users/minhthanh/Work/Side/overwrite/src/providers/file-explorer/file-action-handler.ts)

- No behavior changes required. The parser still emits `action` in `{create|modify|rewrite|delete|rename}` and the same `changes`/`newPath` fields.

### Prompt Text

File: [src/prompts/xml-instruction.ts](file:///Users/minhthanh/Work/Side/overwrite/src/prompts/xml-instruction.ts)

- Replace the entire instruction constant with OPX-only wording and examples.
- Remove references to legacy format.

---

## DX

- OPX is simpler to read and write:
  - One element per edit (`<edit>`), with an explicit `op` attribute.
  - Clear, distinct delimiters `<<<` / `>>>` for literal content.
  - Optional `<why>` enables short, per-edit intent

---

## Testing Plan (Immediate)

Parser unit tests (targeted):
- Valid cases: `new`, `patch`, `replace`, `remove`, `move`.
- Occurrence handling: `first`, `last`, numeric `N`, ambiguous without `occurrence` (error).
- Marker parsing: mixed whitespace around `<<<`/`>>>`.
- Error cases: missing attributes, missing required children, multiple `<put>`/`<find>`.

Webview tests (Apply tab):
- Lint/normalization for `<edit>`/`<to>` tags.
- Preview renders correct summary and per-row apply functions.

Manual smoke:
- Dev playground at http://localhost:5173/.
- Paste each example from this document and verify preview/apply success.

---

## Risks & Mitigations

- LLM adherence to the new format:
  - Keep instruction text concise and provide 3–4 OPX examples.
  - Use stable tags/attributes and simple markers.
- Content delimiter collision:
  - `<<<`/`>>>` are uncommon; if conflicts appear, OPX v1.1 can add an optional custom `marker` attribute.

---

## Acceptance Criteria

- Legacy input is no longer accepted; OPX-only responses are parsed and applied.
- All five operations (`new`, `patch`, `replace`, `remove`, `move`) work end-to-end via Apply tab.
- Instruction text is replaced with OPX-only content.
- Unit tests for OPX pass; Apply tab previews and applies OPX responses successfully.

---

## Implementation Checklist

1) Parser
- [x] Remove legacy parsing path and `===` marker support.
- [x] Implement OPX-only parsing with `<<<`/`>>>` markers.
- [x] Map `op` → internal actions.

2) Preprocessor
- [x] Normalize/lint `<edit>` and `<to>`.
- [x] Remove legacy tag handling and lints.

3) Prompt text
- [x] Replace instruction in [src/prompts/xml-instruction.ts](file:///Users/minhthanh/Work/Side/overwrite/src/prompts/xml-instruction.ts) with OPX.

4) Tests
- [x] Add OPX parser tests.
- [x] Update/Add webview tests for OPX samples.

5) Manual smoke
- [ ] Validate examples from this PRD in the dev playground.

---

## Release Checklist (OPX v1)

- [x] Replace prompt instructions with OPX-only (src/prompts/xml-instruction.ts)
- [x] Parser OPX-only (src/utils/xml-parser.ts) and preprocessor normalization (src/webview-ui/.../preprocess.ts)
- [x] Backend tests green: `pnpm test`
- [x] Webview tests green: `pnpm -C src/webview-ui test --run`
- [ ] Optional manual smoke in dev playground (http://localhost:5173/)
- [ ] Bump version in package.json if releasing
- [ ] Package: `pnpm package` (or `pnpm vscode:package`)


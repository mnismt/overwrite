# Roadmap

## 1. Ignore Handling & Performance

- Nested `.gitignore` support: load directory-level `.gitignore` files during traversal with correct precedence and `!negation` handling.
- Respect VS Code settings: merge `files.exclude` and `search.exclude` (workspace and user) into the ignore pipeline.
- Performance controls:
  - Add cancellation tokens and a progress indicator for long walks.
  - Concurrency limits and early ignore checks before deeper recursion.
  - Depth/size guards against extremely large trees; surface a “Too large, refine filters” message.
  - Cache per-directory ignore matchers; add file system watchers to incrementally update the tree.
- Diagnostics & UX:
  - Optional “Why hidden?” hover showing which rule excluded a path.
  - Setting toggles: enable/disable use of Git global excludes; per-workspace overrides.

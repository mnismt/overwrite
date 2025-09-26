# Telemetry in Overwrite

## Overview

Overwrite collects **anonymous** usage information to help us improve the extension and understand how users interact with its features. This data helps us optimize the user experience and prioritize future development. You can opt out of telemetry collection at any time.

We use PostHog, an open-source platform for product analytics, to collect and analyze this data.

## What We Track

The following usage information is collected and reported:

### Extension Lifecycle

- When the extension is activated (excluding workspace details)
- When the extension is deactivated
- Session duration and activation performance

### File Operations

- When files are selected for token counting (excluding file contents and paths)
- When context is copied to clipboard (excluding actual content)
- File count and size distributions (bucketed, not exact sizes)

#### File & Token Counting

We track the total number of files selected and their size distributions, but **we never read or store the actual contents of these files**. This helps us understand usage patterns without compromising your privacy. Token counts are aggregated totals without revealing code content.

### Settings & Configuration

- When extension settings are saved (excluding actual values)
- Number of excluded folder patterns (not the patterns themselves)
- Telemetry enablement status

### Apply Changes Operations

- When LLM-suggested changes are applied (excluding code content)
- Success/failure rates and performance metrics
- Number of files modified (not which files or what changes)

### Error Tracking

- When unexpected errors occur (stack traces are hashed, not stored)
- Error categories and frequencies (excluding sensitive details)
- Performance issues and bottlenecks

## Data Privacy

All telemetry data is:

- **Completely anonymous** using randomly generated UUIDs
- **Stripped of all file paths, names, and contents**
- **Free of personal identifiable information (PII)**
- **Size-bucketed** rather than exact measurements
- **Sampled** for high-frequency events (20% for copy actions)

Additional metadata included with events:

- VS Code version
- Extension version
- Operating system (platform only)
- Node.js version

**What we NEVER collect:**

- File paths or filenames
- Code content or file contents
- User names or machine identifiers
- Workspace locations
- Actual error messages with sensitive data

## Telemetry Implementation

For complete transparency, you can review our telemetry implementation in these files:

- [src/services/telemetry.ts](src/services/telemetry.ts): Core telemetry service with privacy safeguards
- [src/providers/file-explorer/index.ts](src/providers/file-explorer/index.ts): Integration points
- [docs/telemetry.md](docs/telemetry.md): Detailed technical documentation

## How to Opt Out

You can disable telemetry through VS Code settings:

1. **VS Code Global Setting:**
   - Open VS Code Settings (/Ctrl + ,)
   - Search for "telemetry"
   - Set "Telemetry Level" to "off"

2. **Extension-Specific Setting:**
   - Open VS Code Settings (/Ctrl + ,)
   - Search for "Overwrite"
   - Find "Enable Telemetry" setting
   - Uncheck the box to disable telemetry

Alternatively, you can add this to your VS Code `settings.json`:

```json
{
  "telemetry.telemetryLevel": "off",
  "overwrite.telemetry.enabled": false
}
```

## Data Retention

- Data is stored securely on PostHog's infrastructure
- Anonymous IDs are rotated and cannot be linked to individuals
- No local data storage or caching of telemetry information

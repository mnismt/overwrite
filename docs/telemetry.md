# Telemetry Documentation

## Overview

Overwrite includes a minimal, privacy-preserving telemetry service that helps understand user behavior and improve the extension. The telemetry system is designed with strict privacy guardrails to ensure no sensitive information is ever captured.

## Privacy Guardrails

### What is NEVER Captured
- File paths or file names
- File contents or code
- User identifiers (machine ID, user names, etc.)
- Sensitive environment variables
- Raw error messages with stack traces

### What IS Captured
- Anonymous usage patterns
- Performance metrics (timing, token counts)
- Error types (without sensitive details)
- File size distributions (bucketed)
- Extension version and environment info

## Configuration

### Enabling/Disabling Telemetry

Telemetry respects both VS Code's global telemetry setting and the extension's own setting:

```json
{
  "telemetry.telemetryLevel": "all|error|crash|off",
  "overwrite.telemetry.enabled": true|false
}
```

Telemetry is only active when:
- VS Code telemetry level is NOT "off"
- Extension telemetry setting is enabled
- PostHog API key is configured

### API Key Configuration

Set the PostHog API key via:

1. **Environment variable** (recommended for development):
   ```bash
   export POSTHOG_API_KEY=your_api_key_here
   ```

2. **Local .env file** (extension root):
   ```
   POSTHOG_API_KEY=your_api_key_here
   ```

## Event Types

### Lifecycle Events

#### `extension_activated`
Fired when the extension starts up.

**Properties:**
- `activation_time_ms`: Time taken to activate
- `ext_version`: Extension version
- `vscode_version`: VS Code version
- `os`: Operating system platform
- `node_version`: Node.js version
- `session_id`: Anonymous session identifier

#### `extension_deactivated`
Fired when the extension shuts down.

**Properties:**
- `session_duration_ms`: Total session length

### Settings Events

#### `settings_saved`
Fired when user saves extension settings.

**Properties:**
- `excluded_folders_count`: Number of excluded folder patterns
- `telemetry_enabled`: Current telemetry state

### Token Counting Flow

#### `token_count_started`
Fired when token counting begins.

**Properties:**
- `request_id`: Unique operation identifier
- `selected_file_count`: Number of files being processed
- `total_selected_size`: File size bucket (see [File Size Bucketing](#file-size-bucketing))

#### `token_count_completed`
Fired when token counting succeeds.

**Properties:**
- `request_id`: Operation identifier
- `duration_ms`: Processing time
- `estimated_tokens_total`: Total tokens counted
- `cache_hit`: Whether cache was used (boolean)

#### `token_count_failed`
Fired when token counting fails.

**Properties:**
- `request_id`: Operation identifier
- `duration_ms`: Time before failure
- `error_code`: Error type (sanitized)

### Apply Changes Flow

#### `apply_started`
Fired when applying LLM-suggested changes begins.

**Properties:**
- `request_id`: Unique operation identifier
- `planned_files_count`: Number of files to be modified
- `diff_hunk_count`: Number of change hunks

#### `apply_completed`
Fired when changes are successfully applied.

**Properties:**
- `request_id`: Operation identifier
- `duration_ms`: Total application time
- `files_touched_count`: Number of files actually modified
- `diff_hunk_count`: Number of hunks processed

#### `apply_failed`
Fired when change application fails.

**Properties:**
- `request_id`: Operation identifier
- `duration_ms`: Time before failure
- `error_code`: Error category (`ParseError`, `NoActions`, etc.)
- `files_touched_count`: Partial success count

### Copy Actions

#### `copy_to_clipboard`
Fired when context is copied to clipboard (20% sampling).

**Properties:**
- `token_count`: Total tokens in copied content
- `source`: Copy source (`context`, `context_xml`)
- `selected_file_count`: Number of files included

### Error Tracking

#### `error_unhandled`
Fired when unexpected errors occur.

**Properties:**
- `where`: Error location (`backend`, `webview`)
- `error_code`: Error type name
- `stack_hash`: SHA256 hash of stack trace (first 16 chars)

## Data Sanitization

### File Size Bucketing

Raw file sizes are converted to privacy-preserving buckets:

- `0-1KB`
- `1-10KB` 
- `10-100KB`
- `100KB-1MB`
- `>1MB`

### Path Filtering

All properties are automatically sanitized to remove:
- File paths (strings containing `/` or `\`)
- Absolute paths (starting with `/`, `C:\`, etc.)
- URI schemes with paths (`file://`, `http://`, etc.)

### Request ID Correlation

Operations use UUID request IDs to correlate multi-step flows while maintaining anonymity.

## Sampling

- **100% sampling**: Lifecycle, settings, token counting, apply operations, errors
- **20% sampling**: Copy actions (high frequency events)

## Implementation Details

### Service Architecture

The telemetry service (`src/services/telemetry.ts`) provides:

- **Core capture method**: `capture(event, properties)`
- **Specialized methods**: `captureTokenCount()`, `captureApplyFlow()`, etc.
- **Automatic sanitization**: All properties are cleaned before sending
- **Error handling**: Graceful degradation if telemetry fails

### Integration Points

**Extension Host (Backend):**
- File explorer provider (`src/providers/file-explorer/index.ts`)
- Token counter service (`src/services/token-counter.ts`)
- File action handler (`src/providers/file-explorer/file-action-handler.ts`)

**Webview (Frontend):**
- Global error handlers (`src/webview-ui/src/App.tsx`)
- Message passing error tracking

### Storage

- **Anonymous ID**: Persisted in VS Code global state as `telemetryDistinctId`
- **Session ID**: Generated per activation, not persisted
- **No local data**: All metrics sent to PostHog immediately

## Development

### Testing Telemetry

1. Set `POSTHOG_API_KEY` environment variable
2. Enable telemetry in VS Code settings
3. Use PostHog dashboard or debug mode to verify events

### Adding New Events

1. Add event name to `TelemetryEvent` type
2. Use appropriate capture method with sanitized properties
3. Update this documentation

### Debugging

Set environment variable for verbose logging:
```bash
DEBUG=telemetry
```

## Compliance

This telemetry implementation follows:
- **VS Code Extension Guidelines**
- **GDPR principles** (minimal data, explicit consent)
- **Privacy by design** (no PII collected)

## PostHog Configuration

Events are sent to PostHog with the following setup:
- **Host**: `https://us.i.posthog.com`
- **Project**: Configured via API key
- **Data retention**: Per PostHog project settings
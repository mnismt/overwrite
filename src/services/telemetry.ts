import crypto from 'node:crypto'
import { PostHog } from 'posthog-node'
import * as vscode from 'vscode'

// Minimal, privacy-preserving telemetry service for the extension backend.
// No file paths or contents are ever captured.

export type TelemetryEvent =
	| 'extension_activated'
	| 'extension_deactivated'
	| 'settings_saved'
	| 'token_count_started'
	| 'token_count_completed'
	| 'token_count_failed'
	| 'apply_started'
	| 'apply_completed'
	| 'apply_failed'
	| 'copy_to_clipboard'
	| 'error_unhandled'

type FileSizeBucket = '0-1KB' | '1-10KB' | '10-100KB' | '100KB-1MB' | '>1MB'

class TelemetryService {
	private client?: PostHog
	private distinctId?: string
	private sessionId?: string
	private context?: vscode.ExtensionContext
	private startedAt = Date.now()

	init(context: vscode.ExtensionContext) {
		this.context = context
		this.startedAt = Date.now()

		// Persist anonymous id; never use VS Code machineId directly
		this.distinctId = context.globalState.get<string>('telemetryDistinctId')
		if (!this.distinctId) {
			this.distinctId = crypto.randomUUID()
			void context.globalState.update('telemetryDistinctId', this.distinctId)
		}

		this.sessionId = crypto.randomUUID()

		// Initialize client if telemetry is enabled
		this.initializeClient()

		// Listen for configuration changes
		context.subscriptions.push(
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (
					e.affectsConfiguration('overwrite.telemetry.enabled') ||
					e.affectsConfiguration('telemetry.telemetryLevel')
				) {
					this.handleConfigurationChange()
				}
			}),
		)
	}

	private initializeClient() {
		if (!this.isEnabled()) return
		if (this.client) return // Already initialized

		const apiKey = 'phc_LBityQJ7WJhm3iikesHTPvcLGqwUrSoJqofTKJo35rg'
		this.client = new PostHog(apiKey, { host: 'https://us.i.posthog.com' })

		// Fire activation event with minimal props
		this.capture('extension_activated', {
			activation_time_ms: Date.now() - this.startedAt,
			ext_version: this.context?.extension.packageJSON?.version,
			vscode_version: vscode.version,
			os: process.platform,
			node_version: process.versions.node,
			session_id: this.sessionId,
		})
	}

	private handleConfigurationChange() {
		if (this.isEnabled()) {
			// Telemetry was enabled, initialize if not already done
			this.initializeClient()
		} else {
			// Telemetry was disabled, shutdown client
			if (this.client) {
				void this.client.shutdown()
				this.client = undefined
			}
		}
	}

	isEnabled(): boolean {
		// Check VS Code global telemetry setting
		const globalTelemetryLevel = vscode.workspace
			.getConfiguration('telemetry')
			.get<string>('telemetryLevel')
		if (globalTelemetryLevel === 'off') return false

		// Check extension-specific setting
		const extensionTelemetryEnabled = vscode.workspace
			.getConfiguration('overwrite.telemetry')
			.get<boolean>('enabled', true) // default to true

		console.log(`Overwrite telemetry enabled: ${extensionTelemetryEnabled}`)

		return extensionTelemetryEnabled
	}

	capture(event: TelemetryEvent, properties?: Record<string, unknown>) {
		if (!this.client || !this.isEnabled() || !this.distinctId) return

		const base = {
			ext_version: this.context?.extension.packageJSON?.version,
			vscode_version: vscode.version,
			os: process.platform,
			node_version: process.versions.node,
			session_id: this.sessionId,
		}

		// Use enhanced sanitization
		const sanitizedProperties = properties
			? this.sanitizeProperties(properties)
			: {}

		this.client.capture({
			distinctId: this.distinctId,
			event,
			properties: { ...base, ...sanitizedProperties },
		})
	}

	trackUnhandled(where: 'backend' | 'webview', err: unknown) {
		const error = err instanceof Error ? err : new Error(String(err))
		const stack = error.stack || `${error.name}:${error.message}`
		const hash = crypto
			.createHash('sha256')
			.update(stack)
			.digest('hex')
			.slice(0, 16)
		this.capture('error_unhandled', {
			where,
			error_code: error.name || 'Error',
			stack_hash: hash,
		})
	}

	// Helper methods for data bucketing and sanitization
	bucketFileSize(bytes: number): FileSizeBucket {
		if (bytes <= 1024) return '0-1KB'
		if (bytes <= 10 * 1024) return '1-10KB'
		if (bytes <= 100 * 1024) return '10-100KB'
		if (bytes <= 1024 * 1024) return '100KB-1MB'
		return '>1MB'
	}

	generateRequestId(): string {
		return crypto.randomUUID()
	}

	getSettingsMetadata(): {
		excluded_folders_count: number
		telemetry_enabled: boolean
	} {
		if (!this.context) {
			return { excluded_folders_count: 0, telemetry_enabled: false }
		}

		const excludedFolders = this.context.workspaceState.get<string>(
			'overwrite.excludedFolders',
			'',
		)
		const excludedCount = excludedFolders
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0 && !line.startsWith('#')).length

		return {
			excluded_folders_count: excludedCount,
			telemetry_enabled: this.isEnabled(),
		}
	}

	private sanitizeProperties(
		properties: Record<string, unknown>,
	): Record<string, unknown> {
		const sanitized = { ...properties }

		// Enhanced path-like string detection
		for (const [k, v] of Object.entries(sanitized)) {
			if (typeof v === 'string') {
				// Drop path-like strings (containing slashes with content)
				if (/[\\/][^\\/]+/.test(v)) {
					delete sanitized[k]
					continue
				}
				// Drop absolute paths
				if (/^([a-zA-Z]:)?[/\\]/.test(v)) {
					delete sanitized[k]
					continue
				}
				// Drop URI schemes with paths
				if (/^[a-z]+:\/\/.*[/\\]/.test(v)) {
					delete sanitized[k]
				}
			}
		}

		return sanitized
	}

	// Specialized event capture methods
	captureTokenCount(
		event:
			| 'token_count_started'
			| 'token_count_completed'
			| 'token_count_failed',
		requestId: string,
		properties?: Record<string, unknown>,
	) {
		const settings = this.getSettingsMetadata()
		this.capture(
			event,
			this.sanitizeProperties({
				request_id: requestId,
				...settings,
				...properties,
			}),
		)
	}

	captureApplyFlow(
		event: 'apply_started' | 'apply_completed' | 'apply_failed',
		requestId: string,
		properties?: Record<string, unknown>,
	) {
		const settings = this.getSettingsMetadata()
		this.capture(
			event,
			this.sanitizeProperties({
				request_id: requestId,
				...settings,
				...properties,
			}),
		)
	}

	captureSettings(properties?: Record<string, unknown>) {
		const settings = this.getSettingsMetadata()
		this.capture(
			'settings_saved',
			this.sanitizeProperties({
				...settings,
				...properties,
			}),
		)
	}

	captureCopyAction(properties?: Record<string, unknown>) {
		const settings = this.getSettingsMetadata()
		this.capture(
			'copy_to_clipboard',
			this.sanitizeProperties({
				...settings,
				...properties,
			}),
		)
	}

	async shutdown() {
		if (!this.client) return
		// Emit deactivated before closing
		this.capture('extension_deactivated', {
			session_duration_ms: Date.now() - this.startedAt,
		})
		await this.client.shutdown()
		this.client = undefined
	}
}

export const telemetry = new TelemetryService()

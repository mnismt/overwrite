import { getVsCodeApi } from '../../../utils/vscode'

const LIST_FILES_TIMEOUT_MS = 60_000

export function listFilesUnderUriRemote(
	parentUri: string,
	onProgress?: (progress: {
		filesFound: number
		nodesVisited: number
		truncated: boolean
	}) => void,
): Promise<{ uris: string[]; truncated: boolean }> {
	return new Promise((resolve, reject) => {
		const requestId = `list-${Date.now()}-${Math.random().toString(36).slice(2)}`
		const timeout = setTimeout(() => {
			window.removeEventListener('message', handler)
			reject(new Error('Listing files under folder timed out'))
		}, LIST_FILES_TIMEOUT_MS)

		const handler = (event: MessageEvent) => {
			const msg = event.data as {
				command?: string
				requestId?: string
				uris?: string[]
				truncated?: boolean
				filesFound?: number
				nodesVisited?: number
				error?: string
				aborted?: boolean
			}
			if (
				msg.command === 'listFilesUnderUriProgress' &&
				msg.requestId === requestId
			) {
				onProgress?.({
					filesFound: typeof msg.filesFound === 'number' ? msg.filesFound : 0,
					nodesVisited:
						typeof msg.nodesVisited === 'number' ? msg.nodesVisited : 0,
					truncated: Boolean(msg.truncated),
				})
				return
			}
			if (
				msg.command === 'listFilesUnderUriResponse' &&
				msg.requestId === requestId
			) {
				clearTimeout(timeout)
				window.removeEventListener('message', handler)
				if (msg.error) {
					const error = new Error(msg.error)
					if (msg.aborted) error.name = 'AbortError'
					reject(error)
					return
				}
				resolve({
					uris: Array.isArray(msg.uris) ? msg.uris : [],
					truncated: Boolean(msg.truncated),
				})
			}
		}

		window.addEventListener('message', handler)
		getVsCodeApi().postMessage({
			command: 'listFilesUnderUri',
			payload: { parentUri, requestId },
		})
	})
}

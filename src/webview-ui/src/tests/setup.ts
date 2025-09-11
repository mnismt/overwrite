import * as matchers from '@testing-library/jest-dom/matchers'
import { cleanup } from '@testing-library/react'
import { afterEach, expect } from 'vitest'
import '@testing-library/jest-dom'

expect.extend(matchers)

// Provide a generic value property for custom elements (e.g., <vscode-textarea>)
// so fireEvent.input can set it during tests.
if (!Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'value')) {
  Object.defineProperty(HTMLElement.prototype, 'value', {
    configurable: true,
    get() {
      return (this as HTMLElement).getAttribute('value') ?? ''
    },
    set(v: unknown) {
      ;(this as HTMLElement).setAttribute('value', String(v ?? ''))
    },
  })
}

afterEach(() => {
  cleanup()
})

// In constrained sandboxes, Vitest + tinypool sometimes triggers an unhandled rejection
// during worker teardown. Swallow those specific teardown errors to avoid false negatives.
process.on('unhandledRejection', (err) => {
  const msg = String(err ?? '')
  if (msg.includes('tinypool') || msg.includes('ThreadPool._removeWorker')) {
    // no-op
    return
  }
  // Re-throw others to surface real issues
  throw err
})

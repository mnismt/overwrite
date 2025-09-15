import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ResponseTextarea from '../response-textarea'

describe('ResponseTextarea', () => {
	it('renders label and textarea with correct attributes', () => {
		const mockOnTextChange = vi.fn()

		render(<ResponseTextarea responseText="" onTextChange={mockOnTextChange} />)

		const label = screen.getByText('Paste LLM Response (XML Format)')
		const textarea = screen.getByPlaceholderText(
			'Paste the full XML response from the AI here...',
		)

		expect(label).toBeInTheDocument()
		expect(textarea).toBeInTheDocument()
		expect(textarea).toHaveAttribute('id', 'llm-response-textarea')
		expect(textarea).toHaveAttribute('rows', '15')
	})

	it('displays the provided response text', () => {
		const mockOnTextChange = vi.fn()
		const testText = '<file path="test.ts" action="modify">content</file>'

		render(
			<ResponseTextarea
				responseText={testText}
				onTextChange={mockOnTextChange}
			/>,
		)

		const textarea = screen.getByPlaceholderText(
			'Paste the full XML response from the AI here...',
		)
		expect(textarea).toHaveValue(testText)
	})

	it('calls onTextChange when textarea input changes', () => {
		const mockOnTextChange = vi.fn()

		render(<ResponseTextarea responseText="" onTextChange={mockOnTextChange} />)

		const textarea = screen.getByPlaceholderText(
			'Paste the full XML response from the AI here...',
		)
		const newText = '<file path="example.ts" action="create">new content</file>'

		fireEvent.input(textarea, { target: { value: newText } })

		expect(mockOnTextChange).toHaveBeenCalledTimes(1)
		expect(mockOnTextChange).toHaveBeenCalledWith(
			expect.objectContaining({
				target: expect.objectContaining({ value: newText }),
			}),
		)
	})

	it('handles multiple text changes', () => {
		const mockOnTextChange = vi.fn()

		render(<ResponseTextarea responseText="" onTextChange={mockOnTextChange} />)

		const textarea = screen.getByPlaceholderText(
			'Paste the full XML response from the AI here...',
		)

		fireEvent.input(textarea, { target: { value: 'first change' } })
		fireEvent.input(textarea, { target: { value: 'second change' } })
		fireEvent.input(textarea, { target: { value: 'third change' } })

		expect(mockOnTextChange).toHaveBeenCalledTimes(3)
	})

	it('has proper accessibility attributes', () => {
		const mockOnTextChange = vi.fn()

		render(<ResponseTextarea responseText="" onTextChange={mockOnTextChange} />)

		const label = screen.getByText('Paste LLM Response (XML Format)')
		const textarea = screen.getByPlaceholderText(
			'Paste the full XML response from the AI here...',
		)

		// Check that label is associated with textarea
		expect(label).toHaveAttribute('htmlFor', 'llm-response-textarea')
		expect(textarea).toHaveAttribute('id', 'llm-response-textarea')
	})

	it('handles empty text input', () => {
		const mockOnTextChange = vi.fn()

		render(
			<ResponseTextarea
				responseText="some initial text"
				onTextChange={mockOnTextChange}
			/>,
		)

		const textarea = screen.getByPlaceholderText(
			'Paste the full XML response from the AI here...',
		)
		expect(textarea).toHaveValue('some initial text')

		fireEvent.input(textarea, { target: { value: '' } })

		expect(mockOnTextChange).toHaveBeenCalledWith(
			expect.objectContaining({
				target: expect.objectContaining({ value: '' }),
			}),
		)
	})

	it('handles large XML content', () => {
		const mockOnTextChange = vi.fn()
		const largeXml = `
<files>
	<file path="src/component1.ts" action="modify">
		<search>old content 1</search>
		<content>new content 1</content>
	</file>
	<file path="src/component2.ts" action="create">
		<content>new file content</content>
	</file>
	<file path="src/component3.ts" action="rewrite">
		<content>completely rewritten content</content>
	</file>
</files>`.trim()

		render(<ResponseTextarea responseText="" onTextChange={mockOnTextChange} />)

		const textarea = screen.getByPlaceholderText(
			'Paste the full XML response from the AI here...',
		)
		fireEvent.input(textarea, { target: { value: largeXml } })

		expect(mockOnTextChange).toHaveBeenCalledWith(
			expect.objectContaining({
				target: expect.objectContaining({ value: largeXml }),
			}),
		)
	})
})

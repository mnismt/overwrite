import { analyzeFileAction, analyzeFileActions } from '../change-analyzer'

interface ChangeBlock {
	description: string
	search?: string
	content: string
}

interface FileAction {
	path: string
	action: 'create' | 'rewrite' | 'modify' | 'delete' | 'rename'
	newPath?: string
	changes?: ChangeBlock[]
}

describe('change-analyzer', () => {
	describe('analyzeFileAction', () => {
		it('analyzes create action correctly', () => {
			const fileAction: FileAction = {
				path: 'test.txt',
				action: 'create',
				changes: [
					{
						description: 'Create new file',
						content: 'line1\nline2\nline3',
					},
				],
			}

			const result = analyzeFileAction(fileAction)

			expect(result.path).toBe('test.txt')
			expect(result.action).toBe('create')
			expect(result.description).toBe('Create new file')
			expect(result.changes.added).toBe(3)
			expect(result.changes.removed).toBe(0)
		})

		it('analyzes rewrite action correctly', () => {
			const fileAction: FileAction = {
				path: 'test.txt',
				action: 'rewrite',
				changes: [
					{
						description: 'Rewrite entire file',
						content: 'new line1\nnew line2',
					},
				],
			}

			const result = analyzeFileAction(fileAction)

			expect(result.description).toBe('Rewrite entire file')
			expect(result.changes.added).toBe(2)
			expect(result.changes.removed).toBe(Math.ceil(2 * 0.8)) // Estimated removed lines
		})

		it('analyzes modify action correctly', () => {
			const fileAction: FileAction = {
				path: 'test.txt',
				action: 'modify',
				changes: [
					{
						description: 'Update function',
						search: 'old function',
						content: 'new function\nwith extra line',
					},
					{
						description: 'Fix bug',
						search: 'buggy code',
						content: 'fixed code',
					},
				],
			}

			const result = analyzeFileAction(fileAction)

			expect(result.description).toBe('Update function • Fix bug')
			expect(result.changes.added).toBe(3) // 2 + 1 lines of new content
			expect(result.changes.removed).toBe(2) // 1 + 1 lines of search content
		})

		it('analyzes delete action correctly', () => {
			const fileAction: FileAction = {
				path: 'test.txt',
				action: 'delete',
			}

			const result = analyzeFileAction(fileAction)

			expect(result.description).toBe('Delete file')
			expect(result.changes.added).toBe(0)
			expect(result.changes.removed).toBe(50) // Default estimation
		})

		it('analyzes rename action correctly', () => {
			const fileAction: FileAction = {
				path: 'old.txt',
				action: 'rename',
				newPath: 'new.txt',
			}

			const result = analyzeFileAction(fileAction)

			expect(result.description).toBe('Rename to new.txt')
			expect(result.changes.added).toBe(0)
			expect(result.changes.removed).toBe(0)
			expect(result.newPath).toBe('new.txt')
		})

		it('handles modify action with many changes', () => {
			const fileAction: FileAction = {
				path: 'test.txt',
				action: 'modify',
				changes: [
					{ description: 'Change 1', search: 'old1', content: 'new1' },
					{ description: 'Change 2', search: 'old2', content: 'new2' },
					{ description: 'Change 3', search: 'old3', content: 'new3' },
					{ description: 'Change 4', search: 'old4', content: 'new4' },
					{ description: 'Change 5', search: 'old5', content: 'new5' },
				],
			}

			const result = analyzeFileAction(fileAction)

			expect(result.description).toBe('Change 1 • Change 2 • (+3 more)')
		})

		it('provides fallback descriptions for missing content', () => {
			const createAction: FileAction = {
				path: 'test.txt',
				action: 'create',
			}

			const modifyAction: FileAction = {
				path: 'test.txt',
				action: 'modify',
			}

			expect(analyzeFileAction(createAction).description).toBe('Create file')
			expect(analyzeFileAction(modifyAction).description).toBe('Modify file')
		})
	})

	describe('analyzeFileActions', () => {
		it('analyzes multiple file actions', () => {
			const fileActions: FileAction[] = [
				{
					path: 'file1.txt',
					action: 'create',
					changes: [{ description: 'Create file1', content: 'content' }],
				},
				{
					path: 'file2.txt',
					action: 'delete',
				},
			]

			const results = analyzeFileActions(fileActions)

			expect(results).toHaveLength(2)
			expect(results[0].path).toBe('file1.txt')
			expect(results[0].action).toBe('create')
			expect(results[1].path).toBe('file2.txt')
			expect(results[1].action).toBe('delete')
		})
	})
})

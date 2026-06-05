import type { VscodeTreeItem } from '../../../types'

export interface IndexedNode {
	children: string[]
	isFolder: boolean
	item: VscodeTreeItem
}
export interface TreeIndex {
	nodes: Map<string, IndexedNode>
	parentByUri: Map<string, string>
	childIndexByUri: Map<string, number>
	rootIndexByUri: Map<string, number>
	postOrder: string[]
	roots: VscodeTreeItem[]
	descendantFileCount: Map<string, number>
}

export function buildTreeIndex(items: VscodeTreeItem[]): TreeIndex {
	const nodes = new Map<string, IndexedNode>()
	const parentByUri = new Map<string, string>()
	const childIndexByUri = new Map<string, number>()
	const rootIndexByUri = new Map<string, number>()
	const descendantFileCount = new Map<string, number>()
	const postOrder: string[] = []

	const visit = (
		item: VscodeTreeItem,
		parentUri?: string,
		childIndex?: number,
	): number => {
		const uri = item.value
		const isFolder = item.icons?.branch === 'folder'
		const children = item.subItems?.map((c) => c.value) ?? []
		nodes.set(uri, { children, isFolder, item })
		if (parentUri) parentByUri.set(uri, parentUri)
		if (childIndex !== undefined) childIndexByUri.set(uri, childIndex)
		let fileCount = 0
		if (isFolder) {
			// subItems is undefined for lazily-loaded folders that haven't been
			// expanded yet; treat as an empty (0-file) subtree until children load.
			for (let i = 0; i < (item.subItems ?? []).length; i++) {
				const child = item.subItems![i]
				fileCount += visit(child, uri, i)
			}
		} else {
			fileCount = 1
		}
		descendantFileCount.set(uri, fileCount)
		postOrder.push(uri)
		return fileCount
	}
	for (let i = 0; i < items.length; i++) {
		rootIndexByUri.set(items[i].value, i)
		visit(items[i], undefined, i)
	}
	return {
		nodes,
		parentByUri,
		childIndexByUri,
		rootIndexByUri,
		postOrder,
		roots: items,
		descendantFileCount,
	}
}

function removeIndexedSubtree(index: TreeIndex, uri: string): void {
	const node = index.nodes.get(uri)
	if (!node) return
	for (const childUri of node.children) {
		removeIndexedSubtree(index, childUri)
	}
	index.nodes.delete(uri)
	index.parentByUri.delete(uri)
	index.childIndexByUri.delete(uri)
	index.rootIndexByUri.delete(uri)
	index.descendantFileCount.delete(uri)
}

function addIndexedSubtree(
	index: TreeIndex,
	item: VscodeTreeItem,
	parentUri: string,
	childIndex: number,
): number {
	const isFolder = item.icons?.branch === 'folder'
	const children = item.subItems?.map((child) => child.value) ?? []
	index.nodes.set(item.value, { children, isFolder, item })
	index.parentByUri.set(item.value, parentUri)
	index.childIndexByUri.set(item.value, childIndex)

	let fileCount = isFolder ? 0 : 1
	if (isFolder) {
		for (let i = 0; i < (item.subItems ?? []).length; i++) {
			fileCount += addIndexedSubtree(index, item.subItems![i], item.value, i)
		}
	}
	index.descendantFileCount.set(item.value, fileCount)
	return fileCount
}

function buildPathToRoot(index: TreeIndex, uri: string): string[] {
	const path = [uri]
	let current = uri
	while (index.parentByUri.has(current)) {
		current = index.parentByUri.get(current)!
		path.push(current)
	}
	return path.reverse()
}

function cloneWithChildrenAtPath(
	item: VscodeTreeItem,
	path: string[],
	pathIndex: number,
	children: VscodeTreeItem[],
	index: TreeIndex,
): VscodeTreeItem {
	if (pathIndex === path.length - 1) {
		return { ...item, subItems: children }
	}

	const nextUri = path[pathIndex + 1]
	const childIndex = index.childIndexByUri.get(nextUri)
	if (childIndex === undefined || !item.subItems) return item

	const nextSubItems = item.subItems.slice()
	nextSubItems[childIndex] = cloneWithChildrenAtPath(
		nextSubItems[childIndex],
		path,
		pathIndex + 1,
		children,
		index,
	)
	return { ...item, subItems: nextSubItems }
}

export function mergeChildrenIntoIndexedTree(
	tree: VscodeTreeItem[],
	index: TreeIndex,
	parentUri: string,
	children: VscodeTreeItem[],
): { tree: VscodeTreeItem[]; index: TreeIndex } {
	if (!index.nodes.has(parentUri)) return { tree, index }

	const path = buildPathToRoot(index, parentUri)
	const rootUri = path[0]
	const rootIndex = index.rootIndexByUri.get(rootUri)
	if (rootIndex === undefined) return { tree, index }

	const nextTree = tree.slice()
	const updatedRoot = cloneWithChildrenAtPath(
		nextTree[rootIndex],
		path,
		0,
		children,
		index,
	)
	nextTree[rootIndex] = updatedRoot

	const nextIndex: TreeIndex = {
		...index,
		nodes: new Map(index.nodes),
		parentByUri: new Map(index.parentByUri),
		childIndexByUri: new Map(index.childIndexByUri),
		rootIndexByUri: new Map(index.rootIndexByUri),
		descendantFileCount: new Map(index.descendantFileCount),
		roots: nextTree,
	}

	const parentNode = nextIndex.nodes.get(parentUri)
	if (parentNode) {
		for (const childUri of parentNode.children) {
			removeIndexedSubtree(nextIndex, childUri)
		}
		const nextChildren = children.map((child) => child.value)
		nextIndex.nodes.set(parentUri, {
			...parentNode,
			children: nextChildren,
			item:
				path.length === 1
					? updatedRoot
					: { ...parentNode.item, subItems: children },
		})
		let fileCount = 0
		for (let i = 0; i < children.length; i++) {
			fileCount += addIndexedSubtree(nextIndex, children[i], parentUri, i)
		}
		nextIndex.descendantFileCount.set(parentUri, fileCount)
	}

	return { tree: nextTree, index: nextIndex }
}

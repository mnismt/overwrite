import type { VscodeTreeItem } from '../../../../../types'

export interface IndexedNode { children: string[]; isFolder: boolean; item: VscodeTreeItem }
export interface TreeIndex {
  nodes: Map<string, IndexedNode>
  postOrder: string[]
  roots: VscodeTreeItem[]
  descendantFileCount: Map<string, number>
}

export function buildTreeIndex(items: VscodeTreeItem[]): TreeIndex {
  const nodes = new Map<string, IndexedNode>()
  const descendantFileCount = new Map<string, number>()
  const postOrder: string[] = []

  const visit = (item: VscodeTreeItem): number => {
    const uri = item.value
    const isFolder = !!(item.subItems && item.subItems.length > 0)
    const children = item.subItems?.map((c) => c.value) ?? []
    nodes.set(uri, { children, isFolder, item })
    let fileCount = 0
    if (isFolder) {
      for (const child of item.subItems!) {
        fileCount += visit(child)
      }
    } else {
      fileCount = 1
    }
    descendantFileCount.set(uri, fileCount)
    postOrder.push(uri)
    return fileCount
  }
  for (const root of items) visit(root)
  return { nodes, postOrder, roots: items, descendantFileCount }
}

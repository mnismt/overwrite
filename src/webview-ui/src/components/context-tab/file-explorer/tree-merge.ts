import type { VscodeTreeItem } from '../../../types'

export function mergeChildren(
	tree: VscodeTreeItem[],
	parentUri: string,
	children: VscodeTreeItem[],
): VscodeTreeItem[] {
	const mergeInto = (items: VscodeTreeItem[]): VscodeTreeItem[] => {
		return items.map((item) => {
			if (item.value === parentUri) {
				return { ...item, subItems: children }
			}
			if (item.subItems && item.subItems.length > 0) {
				return { ...item, subItems: mergeInto(item.subItems) }
			}
			return item
		})
	}
	return mergeInto(tree)
}

export function isFolderItem(item: VscodeTreeItem): boolean {
	return item.icons?.branch === 'folder'
}

export function folderNeedsLoad(item: VscodeTreeItem): boolean {
	return isFolderItem(item) && item.subItems === undefined
}

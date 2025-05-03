function debounce(func, wait) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}


(() => {
  const vscode = acquireVsCodeApi()
  const fileTreeContainer = document.getElementById('file-tree-container')
  const refreshButton = document.getElementById('refresh-button')
  const searchInput = document.getElementById('search-input')
  const progressRing = document.getElementById('progress-ring')

  // Context Tab Elements
  const selectedCountSpan = document.getElementById('selected-count')
  const userInstructionsTextarea = document.getElementById('user-instructions')
  const copyButton = document.getElementById('copy-button')
  const copyXmlButton = document.getElementById('copy-xml-button')

  function sendMessageToExtension(message) {
    progressRing.style.display = 'block'
    vscode.postMessage(message)
  }

  function filterFileTree(fileTree, searchInput) {
    return fileTree.filter((item) => item.label.includes(searchInput))
  }

  // Store selection state locally in the webview
  const selectedPaths = new Set()

  // ─── New Helper Functions ───────────────────────────────────────────────
  // Recursively add a node & its subtree to selectedPaths
  function addPaths(item) {
    selectedPaths.add(item.value)
    if (item.subItems) {
      item.subItems.forEach(addPaths)
    }
  }

  // Recursively remove a node & its subtree from selectedPaths
  function removePaths(item) {
    selectedPaths.delete(item.value)
    if (item.subItems) {
      item.subItems.forEach(removePaths)
    }
  }

  // Walk the tree and set decorations:
  //  • 'F' (green) if *all* descendants are selected (full selection)
  //  • 'H' (yellow) if *some* are selected (partial selection)
  //  • none if none selected
  function recalcDecorations(items) {
    for (const item of items) {
      if (item.subItems) {
        // First update children
        recalcDecorations(item.subItems)

        // Gather every descendant's value
        const allValues = [];
        (function collect(node) {
          allValues.push(node.value)
          if (node.subItems) node.subItems.forEach(collect)
        })(item)

        const total = allValues.length
        const selectedCount = allValues.filter(v => selectedPaths.has(v)).length

        if (selectedCount === total && total > 0) {
          item.decorations = [{
            content: 'F',
            color: '#4CAF50' // green
          }]
        } else if (selectedCount > 0) {
          item.decorations = [{
            content: 'H',
            color: '#FFC107' // yellow
          }]
        } else {
          item.decorations = undefined
        }
      } else {
        // Leaf nodes: show 'F' when selected
        item.decorations = selectedPaths.has(item.value)
          ? [{
            content: 'F',
            color: '#4CAF50' // green
          }]
          : undefined
      }
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  // Replace the old toggleSelection with:
  function toggleSelection(item, isSelected) {
    if (isSelected) {
      addPaths(item)
    } else {
      removePaths(item)
    }

    // Recompute decorations for the entire tree
    if (fileTreeContainer.data) {
      recalcDecorations(fileTreeContainer.data)
      // Force the tree to pick up our changes
      fileTreeContainer.data = [...fileTreeContainer.data]

      // Update the selected count display
      if (selectedCountSpan) {
        selectedCountSpan.textContent = selectedPaths.size.toString()
      }
    }
  }

  // Listen for messages from the extension host
  window.addEventListener('message', (event) => {
    const message = event.data // The JSON data our extension sent
    console.log('Message received in webview:', message)

    switch (message.command) {
      case 'updateFileTree':
        if (fileTreeContainer) {
          fileTreeContainer.data = message.data
        }
        break
      case 'showError': // Handle potential errors from extension
        if (fileTreeContainer) {
          fileTreeContainer.innerHTML = `<p style="color:var(--vscode-errorForeground);">${message.message}</p>`
        }
        break
      // TODO: Add more cases as needed
    }

    progressRing.style.display = 'none'
  })

  // Listener for refresh button
  refreshButton?.addEventListener('click', () => {
    sendMessageToExtension({ command: 'getFileTree' })
    if (fileTreeContainer) fileTreeContainer.innerHTML = 'Loading...' // Show loading indicator
  })

  // Listener for search input with debounce
  searchInput?.addEventListener('input', debounce((event) => {
    const searchInput = event.target.value
    if (!searchInput || searchInput.length === 0) {
      console.log('No search input, refreshing file tree')
      sendMessageToExtension({ command: 'getFileTree' })
      return
    }
    const filteredFileTree = filterFileTree(fileTreeContainer.data, searchInput)
    fileTreeContainer.data = filteredFileTree
  }, 300))

  // Listener for tree actions
  fileTreeContainer.addEventListener("vsc-tree-action", (ev) => {
    switch (ev.detail.actionId) {
      case 'add':
        toggleSelection(ev.detail.item, true)
        break
      case 'remove':
        toggleSelection(ev.detail.item, false)
        break
      default:
        console.log('Unknown action', ev.detail)
    }
  });

  // Listener for Copy Button
  copyButton?.addEventListener('click', () => {
    const originalButtonText = copyButton.innerText; // Store original text
    const userInstructions = userInstructionsTextarea.value;
    sendMessageToExtension({
      command: 'copyContext',
      selectedPaths: Array.from(selectedPaths),
      userInstructions: userInstructions
    });
    // Change button text to indicate success
    copyButton.innerText = 'Copied!';
    // Change button text back after 2 seconds
    setTimeout(() => {
      copyButton.innerText = originalButtonText;
    }, 2000);
    // TODO: Add more robust feedback if needed
  });

  // Listener for Copy XML Button
  copyXmlButton?.addEventListener('click', () => {
    const originalButtonText = copyXmlButton.innerText; // Store original text
    const userInstructions = userInstructionsTextarea.value;
    sendMessageToExtension({
      command: 'copyContextXml',
      selectedPaths: Array.from(selectedPaths),
      userInstructions: userInstructions
    });
    // Change button text to indicate success
    copyXmlButton.innerText = 'Copied!';
    // Change button text back after 2 seconds
    setTimeout(() => {
      copyXmlButton.innerText = originalButtonText;
    }, 2000);
    // TODO: Add more robust feedback if needed
  });

  // Request the initial file tree when the webview loads
  sendMessageToExtension({ command: 'getFileTree' })

})()

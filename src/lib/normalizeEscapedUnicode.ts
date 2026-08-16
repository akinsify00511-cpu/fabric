const ESCAPED_UNICODE: Record<string, string> = {
  '\\u2026': '…',
}

function normalizeText(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let node: Node | null
  while ((node = walker.nextNode())) nodes.push(node as Text)

  for (const text of nodes) {
    let value = text.nodeValue || ''
    for (const [escaped, replacement] of Object.entries(ESCAPED_UNICODE)) {
      value = value.replaceAll(escaped, replacement)
    }
    if (value.includes('\\u2318K')) {
      const isMac = navigator.platform.includes('Mac')
      value = value.replaceAll('\\u2318K', isMac ? '⌘K' : 'Ctrl K')
    }
    if (value !== text.nodeValue) text.nodeValue = value
  }
}

normalizeText(document.body)

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of Array.from(mutation.addedNodes)) normalizeText(node)
  }
})

observer.observe(document.body, { childList: true, subtree: true })

if (typeof window !== 'undefined') {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false },
  })
  const root = globalThis as typeof globalThis & {
    addEventListener: typeof window.addEventListener
    removeEventListener: typeof window.removeEventListener
  }
  root.addEventListener = window.addEventListener.bind(window)
  root.removeEventListener = window.removeEventListener.bind(window)
  const svg = SVGElement.prototype as SVGElement & {
    getComputedTextLength?: () => number
    getBBox?: () => DOMRect
  }
  if (typeof svg.getComputedTextLength !== 'function') {
    svg.getComputedTextLength = function getComputedTextLength(this: SVGElement) {
      return (this.textContent?.length ?? 0) * 7
    }
  }
  if (typeof svg.getBBox !== 'function') {
    svg.getBBox = () => ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      toJSON() { return {} },
    }) as DOMRect
  }
}

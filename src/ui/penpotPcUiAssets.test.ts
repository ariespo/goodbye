import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const assetDir = join(process.cwd(), 'public/assets/ui/penpot/pc')
const globalStylesPath = join(process.cwd(), 'src/styles/globals.css')

function load(name: string) {
  return readFileSync(join(assetDir, name), 'utf8')
}

function cssBlock(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`(^|\\n)\\s*${escapedSelector}\\s*\\{`))
  if (!match || match.index === undefined) return ''
  const start = match.index + match[0].lastIndexOf(selector)

  const end = css.indexOf('}', start)
  return css.slice(start, end + 1)
}

describe('Penpot PC UI overlay assets', () => {
  const states = ['pc-wheel-closed.svg', 'pc-wheel-open.svg']

  it.each(states)('%s uses a transparent 1920x1080 crisp pixel canvas', (name) => {
    const svg = load(name)

    expect(svg).toContain('width="1920" height="1080"')
    expect(svg).toContain('viewBox="0 0 1920 1080"')
    expect(svg).toContain('shape-rendering="crispEdges"')
    expect(svg).not.toMatch(/<filter|<linearGradient|<radialGradient|\srx=/)
    expect(svg).toContain('id="base-background"')
    expect(svg).toContain('fill="none"')
  })

  it.each(states)('%s uses stepped frame paths at the reference proportions', (name) => {
    const svg = load(name)

    expect(svg).toContain('id="MenuFrame"')
    expect(svg).toContain('M12 20H20V12H124V20H132V96H124V104H20V96H12Z')
    expect(svg).toContain('id="TopBarFrame"')
    expect(svg).toContain('M152 20H160V12H1900V20H1908V96H1900V104H160V96H152Z')
    expect(svg).toContain('id="DialogueFrame"')
    expect(svg).toContain('M568 796H1640V804H1648V948H1640V956H568V948H560V804H568Z')
  })

  it('builds five asymmetric wheel sectors around the fixed operation hub', () => {
    const svg = load('pc-wheel-open.svg')

    for (const sector of ['observe', 'investigate', 'action', 'clue', 'map']) {
      expect(svg).toContain(`id="sector-${sector}"`)
      expect(svg).toContain(`id="wheel-icon-${sector}"`)
    }

    expect(svg.match(/class="sector/g)).toHaveLength(5)
    expect(svg).toContain('cx="252" cy="824" r="76"')
    expect(svg).toContain('data-grid="4"')
  })

  it('uses the approved font and larger reference-matched typography', () => {
    const svg = load('pc-wheel-open.svg')

    expect(svg).toContain("font-family:'RenOuFangSong 16','人偶仿宋'")
    expect(svg).toContain('.status{font-size:34px}')
    expect(svg).toContain('.dialogue{font-size:40px}')
    expect(svg).toContain('体力 100/100')
    expect(svg).toContain('理智 70/100')
  })
})

describe('first-batch PC modal CSS contracts', () => {
  it('gives modal frames complete double rails outside the scaled HUD namespace', () => {
    const css = readFileSync(globalStylesPath, 'utf8')
    const modalLayers = cssBlock(css, '.world-pixel-frame-modal > .pixel-frame-layers')
    const modalLayer = cssBlock(css, '.world-pixel-frame-modal > .pixel-frame-layers > .pixel-frame-layer')
    const modalUnderlay = cssBlock(css, '.world-pixel-frame-modal > .pixel-frame-layers > .pixel-frame-layer--underlay')
    const modalOuter = cssBlock(css, '.world-pixel-frame-modal > .pixel-frame-layers > .pixel-frame-layer--outer')
    const modalGap = cssBlock(css, '.world-pixel-frame-modal > .pixel-frame-layers > .pixel-frame-layer--gap')
    const modalInner = cssBlock(css, '.world-pixel-frame-modal > .pixel-frame-layers > .pixel-frame-layer--inner')
    const modalFill = cssBlock(css, '.world-pixel-frame-modal > .pixel-frame-layers > .pixel-frame-layer--fill')
    const modalFrame = cssBlock(css, '.world-pixel-frame-modal')

    expect(modalLayers).toContain('position: absolute')
    expect(modalLayers).toContain('inset: 0')
    expect(modalLayer).toContain('position: absolute')
    expect(modalLayer).toContain('clip-path: polygon(')
    expect(modalUnderlay).toContain('inset: -3px')
    expect(modalOuter).toContain('inset: 0')
    expect(modalGap).toContain('inset: 4px')
    expect(modalInner).toContain('inset: 8px')
    expect(modalFill).toContain('inset: 12px')
    expect(modalFrame).toContain('overflow: visible')
  })

  it('keeps first-batch HUD modals opaque, stepped, fixed-width, and monochrome on interaction', () => {
    const css = readFileSync(globalStylesPath, 'utf8')

    expect(css).toMatch(/\.pixel-modal-frame-content[\s\S]*background(?:-color)?:\s*#050505/)
    expect(css).toMatch(/pixelModalIn[\s\S]*steps\(4, end\)/)
    expect(css).toMatch(/prefers-reduced-motion/)

    for (const selector of ['action-panel', 'clue-modal', 'map-modal']) {
      expect(css).not.toMatch(new RegExp(`\\.hud-design-canvas \\.${selector}[^}]*\\d+vw`))
    }

    // These namespace-local rules must outrank the legacy blue/gold controls
    // without disturbing the portrait layout that still uses the old classes.
    expect(css).toMatch(/\.hud-design-canvas \.pixel-modal-action\.map-travel-button:hover:not\(:disabled\)\s*\{[^}]*border-color:\s*#f2f2f0\s*!important;/)
    expect(css).toMatch(/\.hud-design-canvas \.pixel-modal-action\.clue-infer-button\s*\{[^}]*box-shadow:\s*none;/)
    expect(css).toMatch(/\.hud-design-canvas \.action-panel \.clue-candidate-card\.action-panel-candidate\s*\{[^}]*background-image:\s*none;/)
  })

  it('contains each PC legacy-style override in its own non-greedy rule block', () => {
    const css = readFileSync(globalStylesPath, 'utf8')
    const deleteHover = cssBlock(css, '.hud-design-canvas .clue-delete-button:hover,\n.hud-design-canvas .clue-delete-button:focus-visible')
    const organize = cssBlock(css, '.hud-design-canvas .action-panel .clue-organize-btn')
    const actionScroll = cssBlock(css, '.hud-design-canvas .action-panel .pixel-modal-content.action-panel-content.pixel-scroll-blue')
    const mapFrame = cssBlock(css, '.hud-design-canvas .map-modal-shell > .pixel-modal-frame > .pixel-modal-frame-content')
    const clueFrame = cssBlock(css, '.hud-design-canvas .clue-modal-shell > .pixel-modal-frame > .pixel-modal-frame-content')
    const narrowClueShell = cssBlock(css, '.clue-modal-shell.pixel-modal-shell')
    const narrowClueFrame = cssBlock(css, '.clue-modal-shell > .pixel-modal-frame')

    expect(deleteHover).toContain('border-color: #f2f2f0')
    expect(deleteHover).toContain('box-shadow: none')
    expect(deleteHover).toContain('transform: none')
    expect(deleteHover).toContain('transition: none')
    expect(organize).toContain('border-color: #f2f2f0')
    expect(organize).toContain('background: #050505')
    expect(organize).toContain('box-shadow: none')
    expect(actionScroll).toContain('overflow-y: auto !important')

    for (const block of [mapFrame, clueFrame]) {
      expect(block).toContain('background: #050505')
      expect(block).not.toMatch(/(?:gradient|rgba|transparent|\d+vw)/)
    }

    expect(narrowClueShell).toContain('align-items: stretch !important')
    expect(narrowClueShell).toContain('padding: var(--mobile-safe-top, 10px)')
    expect(narrowClueFrame).toContain('width: 100%')
    expect(narrowClueFrame).toContain('max-height: calc(100dvh - var(--mobile-safe-top, 10px) - var(--mobile-safe-bottom, 10px))')
  })
})

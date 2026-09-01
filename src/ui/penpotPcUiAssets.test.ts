import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const assetDir = join(process.cwd(), 'public/assets/ui/penpot/pc')

function load(name: string) {
  return readFileSync(join(assetDir, name), 'utf8')
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

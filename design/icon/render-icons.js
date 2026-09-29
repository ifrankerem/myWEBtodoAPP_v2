// Renders the launcher and PWA icons from background.svg + foreground.svg.
// Usage: node design/icon/render-icons.js <path-to-chrome>
// (needs playwright-core resolvable from the working directory)
const { chromium } = require('playwright-core')
const fs = require('fs')
const path = require('path')

const dir = __dirname
const root = path.resolve(dir, '../..')
const res = path.join(root, 'android/app/src/main/res')
const uri = (file) => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(dir, file)).toString('base64')
const BG = uri('background.svg')
const FG = uri('foreground.svg')

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }

// `visible` is how much of the 108dp adaptive canvas shows (72 = launcher mask).
function html(size, { layers, visible = 108, radius = '0' }) {
  const full = (size * 108) / visible
  const offset = -(full - size) / 2
  const imgs = layers
    .map((src) => `<img src="${src}" style="position:absolute;left:${offset}px;top:${offset}px;width:${full}px;height:${full}px">`)
    .join('')
  return `<body style="margin:0;background:transparent"><div style="position:relative;width:${size}px;height:${size}px;overflow:hidden;border-radius:${radius}">${imgs}</div></body>`
}

;(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[2] })
  const page = await browser.newPage({ deviceScaleFactor: 1 })

  async function render(out, size, opts) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(html(size, opts))
    await page.waitForFunction(() => [...document.images].every((img) => img.complete))
    await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
  }

  for (const [density, scale] of Object.entries(DENSITIES)) {
    const folder = path.join(res, `mipmap-${density}`)
    const adaptive = Math.round(108 * scale)
    const legacy = Math.round(48 * scale)
    await render(path.join(folder, 'ic_launcher_background.png'), adaptive, { layers: [BG] })
    await render(path.join(folder, 'ic_launcher_foreground.png'), adaptive, { layers: [FG] })
    await render(path.join(folder, 'ic_launcher.png'), legacy, { layers: [BG, FG], visible: 76, radius: '22%' })
    await render(path.join(folder, 'ic_launcher_round.png'), legacy, { layers: [BG, FG], visible: 72, radius: '50%' })
  }

  // PWA icons double as maskable: keep the art inside the 80% safe circle.
  for (const [file, size] of [['public/icons/icon-192.png', 192], ['public/icons/icon-512.png', 512], ['public/apple-icon.png', 180]]) {
    await render(path.join(root, file), size, { layers: [BG, FG], visible: 88 })
  }
  await render(path.join(dir, 'icon-1024.png'), 1024, { layers: [BG, FG], visible: 76, radius: '22%' })

  await browser.close()
})()

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { cn } from '@/lib/utils'

/**
 * A physically lit city at golden hour, rendered with WebGL (three.js, bundled: no external scripts).
 * Glass towers reflect a sky environment map, the sun casts shadows, traffic and clouds move, beacons blink.
 * Everything is generated in code, so there are no image files to download.
 */

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Style = 'glass' | 'concrete'

/** A 4 x 8 grid of window modules, drawn to canvas: colour map plus a warm "lights on" emissive map. */
function facade(seed: number, lit: number, style: Style) {
  const W = 512, H = 1024, cols = 4, rows = 8, cw = W / cols, ch = H / rows
  const map = document.createElement('canvas'); map.width = W; map.height = H
  const em = document.createElement('canvas'); em.width = W; em.height = H
  const m = map.getContext('2d')!, e = em.getContext('2d')!
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H)
  const r = rng(seed)
  m.fillStyle = style === 'glass' ? '#262c34' : '#8b867d'; m.fillRect(0, 0, W, H)
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const px = x * cw, py = y * ch
    if (style === 'glass') {
      const g = m.createLinearGradient(0, py, 0, py + ch)
      const l = 15 + r() * 15
      g.addColorStop(0, `hsl(${208 + r() * 14},${22 + r() * 14}%,${l + 14}%)`)
      g.addColorStop(1, `hsl(${210 + r() * 10},${20 + r() * 10}%,${l}%)`)
      m.fillStyle = g; m.fillRect(px + 3, py + 3, cw - 6, ch - 15)
      m.fillStyle = '#3b4048'; m.fillRect(px, py + ch - 12, cw, 12)             // spandrel / slab edge
      m.strokeStyle = 'rgba(200,210,220,0.28)'; m.lineWidth = 3; m.strokeRect(px + 2, py + 2, cw - 4, ch - 14)
    } else {
      const wx = px + 22, wy = py + 12, ww = cw - 44, wh = ch - 34
      m.fillStyle = `hsl(210,${14 + r() * 8}%,${14 + r() * 8}%)`; m.fillRect(wx, wy, ww, wh)
      m.fillStyle = 'rgba(255,255,255,0.18)'; m.fillRect(wx, wy + wh, ww, 4)   // sill
    }
    if (r() < lit) {
      const wx = style === 'glass' ? px + 6 : px + 22, wy = style === 'glass' ? py + 6 : py + 12
      const ww = style === 'glass' ? cw - 12 : cw - 44, wh = style === 'glass' ? ch - 21 : ch - 34
      e.fillStyle = `rgba(255,${176 + Math.floor(r() * 50)},${96 + Math.floor(r() * 50)},${0.5 + r() * 0.45})`
      e.fillRect(wx, wy, ww, wh)
      if (r() < 0.45) { e.fillStyle = 'rgba(0,0,0,0.55)'; e.fillRect(wx, wy, ww, wh * (0.25 + r() * 0.4)) }   // half-drawn blind
    }
  }
  const tex = (c: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t }
  return { map: tex(map), em: tex(em) }
}

function glowSprite() {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d')!
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, 'rgba(255,240,215,1)'); gr.addColorStop(0.25, 'rgba(255,190,110,0.55)'); gr.addColorStop(1, 'rgba(255,170,80,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

function cloudTexture(seed: number) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128
  const g = c.getContext('2d')!; const r = rng(seed)
  for (let i = 0; i < 38; i++) {
    const x = 40 + r() * 176, y = 40 + r() * 48, rad = 18 + r() * 34
    const gr = g.createRadialGradient(x, y, 0, x, y, rad)
    gr.addColorStop(0, 'rgba(255,226,196,0.30)'); gr.addColorStop(1, 'rgba(255,226,196,0)')
    g.fillStyle = gr; g.fillRect(0, 0, 256, 128)
  }
  return new THREE.CanvasTexture(c)
}

function groundTexture() {
  const S = 2048, c = document.createElement('canvas'); c.width = c.height = S
  const g = c.getContext('2d')!; const r = rng(7)
  g.fillStyle = '#23262c'; g.fillRect(0, 0, S, S)                          // blocks (pavement)
  const k = S / 900                                                         // pixels per metre; the plane is 900 m wide
  const road = 16 * k
  for (let i = -3; i <= 4; i++) {
    const p = (45 + (i - 1) * 90 + 450) * k                                // road centre: x = 45 + 90 (i-1)
    for (const horiz of [false, true]) {
      g.fillStyle = '#4a4d53'; horiz ? g.fillRect(0, p - road / 2 - 3 * k, S, road + 6 * k) : g.fillRect(p - road / 2 - 3 * k, 0, road + 6 * k, S)   // kerb and pavement
      g.fillStyle = '#121418'; horiz ? g.fillRect(0, p - road / 2, S, road) : g.fillRect(p - road / 2, 0, road, S)                                   // asphalt
      g.fillStyle = 'rgba(235,225,200,0.75)'
      for (let d = 0; d < S; d += 14 * k) horiz ? g.fillRect(d, p - 0.25 * k, 7 * k, 0.5 * k) : g.fillRect(p - 0.25 * k, d, 0.5 * k, 7 * k)        // lane dashes
    }
  }
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.045})`; g.fillRect(r() * S, r() * S, 2, 2) }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}

const SKY_VERT = 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
const SKY_FRAG = `varying vec3 vP;
uniform vec3 sunDir;
void main(){
  float h = clamp(vP.y, -0.1, 1.0);
  vec3 horizon = vec3(0.98, 0.69, 0.46);
  vec3 mid = vec3(0.42, 0.52, 0.68);
  vec3 top = vec3(0.05, 0.09, 0.19);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.28, h));
  col = mix(col, top, smoothstep(0.22, 0.95, h));
  float s = max(dot(normalize(vP), normalize(sunDir)), 0.0);
  col += vec3(1.0, 0.62, 0.30) * (pow(s, 8.0) * 0.55 + pow(s, 220.0) * 1.6);
  gl_FragColor = vec4(col, 1.0);
}`

export default function CityScene({ mode = 'hero', className }: { mode?: 'hero' | 'compact'; className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const el = host.current
    if (!el) return
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }) } catch { setFailed(true); return }
    const compact = mode === 'compact'
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.5 : 1.75))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.95
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const SUN = new THREE.Vector3(170, 62, 210)
    scene.fog = new THREE.FogExp2(0xb4a496, 0.0019)

    // Sky dome, and an environment map made from it so glass reflects the sky.
    const sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: { sunDir: { value: SUN.clone() } } }))
    scene.add(sky)
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(sky.geometry, sky.material))
    const envRT = pmrem.fromScene(envScene, 0.02)
    scene.environment = envRT.texture

    const sun = new THREE.DirectionalLight(0xffc88e, 3.2)
    sun.position.copy(SUN)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -190, right: 190, top: 190, bottom: -190, near: 10, far: 700 })
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6
    scene.add(sun)
    scene.add(new THREE.HemisphereLight(0x7b8fb3, 0x1b1d24, 0.75))

    // Materials
    const disposables: { dispose(): void }[] = [envRT, pmrem]
    const sets = { glassA: facade(11, 0.16, 'glass'), glassB: facade(29, 0.3, 'glass'), concrete: facade(53, 0.22, 'concrete') }
    const cache = new Map<string, THREE.MeshStandardMaterial>()
    const wall = (name: keyof typeof sets, w: number, h: number, tint: number, lit = 1.15) => {
      const rx = Math.max(1, Math.round(w / 12.8)), ry = Math.max(1, Math.round(h / 28.8))
      const key = `${name}|${rx}|${ry}|${tint}|${lit}`
      let m = cache.get(key)
      if (!m) {
        const s = sets[name]; const map = s.map.clone(); const em = s.em.clone()
        for (const t of [map, em]) { t.repeat.set(rx, ry); t.needsUpdate = true }
        m = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: lit, color: tint, roughness: name === 'concrete' ? 0.78 : 0.24, metalness: name === 'concrete' ? 0.05 : 0.6, envMapIntensity: name === 'concrete' ? 0.35 : 1.0 })
        cache.set(key, m); disposables.push(m, map, em)
      }
      return m
    }
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a3d43, roughness: 0.9 })
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.35, metalness: 0.85 })
    disposables.push(roofMat, steel)
    const geoms: THREE.BufferGeometry[] = []
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, side: THREE.Material, roof: THREE.Material = roofMat, shadow = true) => {
      const g = new THREE.BoxGeometry(w, h, d); geoms.push(g)
      const m = new THREE.Mesh(g, [side, side, roof, roof, side, side])
      m.position.set(x, y + h / 2, z); m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m
    }

    // Ground
    const gtex = groundTexture(); disposables.push(gtex)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ map: gtex, roughness: 0.6, metalness: 0.15 }))
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground)
    const far = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshBasicMaterial({ color: 0x2b2a2e })); far.rotation.x = -Math.PI / 2; far.position.y = -0.4; scene.add(far)
    geoms.push(ground.geometry, far.geometry)

    // Hero tower: podium, shaft, step-back, crown, antenna.
    const gA = (w: number, h: number) => wall('glassA', w, h, 0xffffff), gB = (w: number, h: number) => wall('glassB', w, h, 0xe9eef5)
    box(48, 15, 48, 0, 0, 0, wall('glassB', 48, 15, 0xffffff, 1.5))
    box(26, 98, 26, 0, 15, 0, gA(26, 98))
    box(20, 22, 20, 0, 113, 0, gB(20, 22))
    box(12, 12, 12, 0, 135, 0, wall('glassA', 12, 12, 0xffffff))
    for (const [fx, fz] of [[-7.4, -7.4], [7.4, -7.4], [-7.4, 7.4], [7.4, 7.4]] as const) box(0.9, 16, 0.9, fx * 0.7, 113, fz * 0.7, steel, steel)   // vertical fins on the step-back
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 26, 8), steel); ant.position.set(0, 160, 0); ant.castShadow = true; scene.add(ant); geoms.push(ant.geometry)
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff3b30, fog: false })); beacon.position.set(0, 173.5, 0); scene.add(beacon); geoms.push(beacon.geometry)
    const beaconLight = new THREE.PointLight(0xff3b30, 0, 60); beaconLight.position.copy(beacon.position); scene.add(beaconLight)

    // Surrounding blocks: taller near the centre.
    const r = rng(2026)
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
      if (i === 0 && j === 0) continue
      const dist = Math.hypot(i, j)
      const n = r() < 0.4 ? 2 : 1
      for (let k = 0; k < n; k++) {
        const w = 18 + r() * 16, d = 18 + r() * 16
        const h = Math.max(14, (95 - dist * 17) * (0.5 + r() * 0.75) + r() * 14)
        const x = i * 90 + (n === 2 ? (k ? 17 : -17) : (r() - 0.5) * 10), z = j * 90 + (n === 2 ? (r() - 0.5) * 14 : (r() - 0.5) * 10)
        const style: keyof typeof sets = r() < 0.34 ? 'concrete' : r() < 0.5 ? 'glassB' : 'glassA'
        const tint = style === 'concrete' ? [0xffffff, 0xf3e6d3, 0xd9dde4][Math.floor(r() * 3)] : [0xffffff, 0xdbe4ee, 0xc7d3e0][Math.floor(r() * 3)]
        const b = box(w, h, d, x, 0, z, wall(style, Math.max(w, d), h, tint, 1.1), roofMat, dist < 3.1)
        if (r() < 0.5) box(w * 0.4, 5, d * 0.4, x + (r() - 0.5) * w * 0.3, h, z + (r() - 0.5) * d * 0.3, roofMat, roofMat, false)   // rooftop plant
        void b
      }
    }

    // Glow sprites (lamps, tail lights) and traffic.
    const glow = glowSprite(); disposables.push(glow)
    const lampPos: number[] = []
    for (const road of [-45, 45]) for (let t = -200; t <= 200; t += 22) { lampPos.push(road + 9, 5.5, t, t, 5.5, road + 9) }
    const lamps = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lampPos, 3)), new THREE.PointsMaterial({ map: glow, size: 11, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffb870, sizeAttenuation: true, fog: false }))
    scene.add(lamps); geoms.push(lamps.geometry); disposables.push(lamps.material as THREE.Material)

    const N = compact ? 24 : 46
    const carGeo = new THREE.BoxGeometry(2, 1.5, 4.6); geoms.push(carGeo)
    const carMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.7 }); disposables.push(carMat)
    const cars = new THREE.InstancedMesh(carGeo, carMat, N); cars.castShadow = true; scene.add(cars)
    const paint = [0xd8dade, 0x2a2d33, 0x6c737d, 0x8c2f2a, 0x1f3b5c, 0xe9e5dc]
    const carData = Array.from({ length: N }, (_, i) => {
      const alongZ = i % 2 === 0, roadIdx = [-1, 0, 1][Math.floor(r() * 3)], dir = r() < 0.5 ? 1 : -1
      cars.setColorAt(i, new THREE.Color(paint[Math.floor(r() * paint.length)]))
      return { alongZ, line: 45 + roadIdx * 90 + dir * 3.6, dir, pos: (r() - 0.5) * 700, speed: 9 + r() * 10 }
    })
    cars.instanceColor!.needsUpdate = true
    const lightPos = new Float32Array(N * 3)
    const carLights = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(lightPos, 3)), new THREE.PointsMaterial({ map: glow, size: 7, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xff5a3c, sizeAttenuation: true, fog: false }))
    scene.add(carLights); geoms.push(carLights.geometry); disposables.push(carLights.material as THREE.Material)
    const dummy = new THREE.Object3D()
    const updateCars = (dt: number) => {
      carData.forEach((c, i) => {
        c.pos += c.dir * c.speed * dt; if (c.pos > 360) c.pos = -360; if (c.pos < -360) c.pos = 360
        const x = c.alongZ ? c.line : c.pos, z = c.alongZ ? c.pos : c.line
        dummy.position.set(x, 0.75, z); dummy.rotation.set(0, c.alongZ ? 0 : Math.PI / 2, 0); dummy.updateMatrix(); cars.setMatrixAt(i, dummy.matrix)
        const back = c.alongZ ? [x, 1, z - c.dir * 2.4] : [x - c.dir * 2.4, 1, z]
        lightPos.set(back, i * 3)
      })
      cars.instanceMatrix.needsUpdate = true; carLights.geometry.attributes.position.needsUpdate = true
    }
    updateCars(0)

    // Clouds
    const clouds: THREE.Sprite[] = []
    for (let i = 0; i < 7; i++) {
      const t = cloudTexture(100 + i); disposables.push(t)
      const mat = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false, opacity: 0.85 }); disposables.push(mat)
      const s = new THREE.Sprite(mat); s.scale.set(900 + r() * 600, 330 + r() * 160, 1); s.position.set(-1400 + r() * 2800, 360 + r() * 260, -1500 + r() * 500); scene.add(s); clouds.push(s)
    }

    // Camera and loop
    const camera = new THREE.PerspectiveCamera(compact ? 40 : 32, 1, 1, 6000)
    const target = new THREE.Vector3(0, compact ? 70 : 62, 0)
    const mouse = { x: 0, y: 0, sx: 0, sy: 0 }
    const onMove = (e: PointerEvent) => { mouse.x = e.clientX / window.innerWidth - 0.5; mouse.y = e.clientY / window.innerHeight - 0.5 }
    window.addEventListener('pointermove', onMove, { passive: true })
    let w = 1, h = 1
    const resize = () => {
      w = Math.max(1, el.clientWidth); h = Math.max(1, el.clientHeight)
      renderer.setSize(w, h, false); camera.aspect = w / h
      if (!compact && w / h > 1.15) camera.setViewOffset(w, h, -w * 0.2, 0, w, h); else camera.clearViewOffset()
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize); ro.observe(el); resize()

    let raf = 0, visible = true, t0 = performance.now(), last = t0
    const frame = (now: number) => {
      const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000); last = now
      mouse.sx += (mouse.x - mouse.sx) * 0.04; mouse.sy += (mouse.y - mouse.sy) * 0.04
      const ang = Math.sin(t * 0.03) * 0.05 + mouse.sx * 0.14
      const rad = (compact ? 400 : 340) + Math.sin(t * 0.03) * 6
      const scroll = Math.min(1, window.scrollY / Math.max(1, h))
      camera.position.set(Math.sin(ang) * rad, 118 + mouse.sy * -26 + scroll * 70, Math.cos(ang) * rad)
      camera.lookAt(target)
      updateCars(dt)
      clouds.forEach((c, i) => { c.position.x += dt * (4 + i); if (c.position.x > 1700) c.position.x = -1700 })
      const blink = Math.sin(t * 2.4) > 0.55
      ;(beacon.material as THREE.MeshBasicMaterial).color.set(blink ? 0xff3b30 : 0x4a1210); beaconLight.intensity = blink ? 220 : 0
      renderer.render(scene, camera)
      if (visible && !reduce) raf = requestAnimationFrame(frame)
    }
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; cancelAnimationFrame(raf); if (visible) { last = performance.now(); raf = requestAnimationFrame(frame) } }, { threshold: 0 })
    io.observe(el)
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); window.removeEventListener('pointermove', onMove)
      geoms.forEach((g) => g.dispose()); disposables.forEach((d) => d.dispose())
      Object.values(sets).forEach((s) => { s.map.dispose(); s.em.dispose() })
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove()
    }
  }, [mode])

  return (
    <div ref={host} className={cn('relative overflow-hidden bg-gradient-to-b from-[#0e1621] via-[#3a4a63] to-[#c98f5b]', className)} aria-hidden>
      {failed && null}
    </div>
  )
}

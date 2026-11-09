/* Red de agentes: nodos, aristas y pulsos que acompañan toda la página.
   Al cargar, parte de los nodos escribe el nombre sobre la tipografía real. */

const CAM_START = 16;
const STAGE = 22;
const STAGES = 7;
const FOV = 50;
const smooth = (u) => u * u * (3 - 2 * u);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const gauss = () => (Math.random() + Math.random() + Math.random()) / 1.5 - 1;

/* Lado de cada clúster: opuesto al contenido, que va alineado a la izquierda */
const CLUSTERS = [[10, 2], [11, -3], [-9, 4], [12, 1], [9, -4], [11, 3], [0, 0]];

const POINT_VS = `
  attribute float aSize; attribute float aGlow; attribute float aTone;
  uniform float uPR; uniform float uDim;
  varying float vA; varying float vG; varying float vT;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position,1.);
    float d = -mv.z;
    gl_PointSize = clamp(aSize*(1.+aGlow*1.5)*uPR*150./max(d,.1), 1.5*uPR, 42.*uPR);
    vA = smoothstep(.8,6.,d)*(1.-smoothstep(30.,66.,d))*(.62+aGlow*.38)*uDim;
    vG = aGlow; vT = aTone;
    gl_Position = projectionMatrix*mv;
  }`;
const POINT_FS = `
  precision mediump float;
  varying float vA; varying float vG; varying float vT;
  void main(){
    float r = length(gl_PointCoord-.5);
    float halo = pow(smoothstep(.5,0.,r),2.2);
    float core = smoothstep(.15,.07,r);
    vec3 cyan = vec3(.34,.89,.86); vec3 sun = vec3(.96,.72,.38);
    vec3 c = mix(mix(cyan,sun,vT),vec3(1.),core*.75+vG*.15);
    gl_FragColor = vec4(c,(halo*.55+core)*vA);
  }`;
const LINE_VS = `
  attribute float aGlow; uniform float uDim;
  varying float vA; varying float vG;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position,1.);
    float d = -mv.z;
    vA = smoothstep(.8,6.,d)*(1.-smoothstep(26.,58.,d))*uDim;
    vG = aGlow;
    gl_Position = projectionMatrix*mv;
  }`;
const LINE_FS = `
  precision mediump float;
  varying float vA; varying float vG;
  void main(){
    vec3 c = mix(vec3(.26,.62,.72),vec3(.66,1.,.97),clamp(vG,0.,1.));
    gl_FragColor = vec4(c,(.15+vG*.75)*vA);
  }`;

export async function createNetwork({ canvas, calm, orbit }) {
  const THREE = await import('../vendor/three.module.min.js');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
  } catch (e) {
    return null;
  }

  let W = innerWidth;
  let H = innerHeight;
  const small = W < 900;
  let pr = Math.min(devicePixelRatio || 1, small ? 1.5 : 2);
  renderer.setPixelRatio(pr);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.1, 120);
  const tanH = Math.tan((FOV * Math.PI) / 360);
  const zEnd = -STAGE * STAGES;

  /* Nodos */
  const N = small ? 200 : 620;
  const NAME = small ? 130 : 340;
  const SPHERE = small ? 40 : 90;
  const home = new Float32Array(N * 3);
  const target = new Float32Array(NAME * 2);
  const pos = new Float32Array(N * 3);
  const glow = new Float32Array(N);
  const size = new Float32Array(N);
  const tone = new Float32Array(N);
  const amt = new Float32Array(N);
  const off = new Float32Array(N * 2);
  const phase = new Float32Array(N);
  const delay = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    let x; let y; let z;
    if (i < NAME) {
      x = rand(-17, 17); y = rand(-10, 10); z = rand(-16, 7);
    } else if (i >= N - SPHERE) {
      const u = rand(-1, 1); const a = rand(0, Math.PI * 2); const s = Math.sqrt(1 - u * u);
      x = s * Math.cos(a) * 8; y = u * 8; z = zEnd + s * Math.sin(a) * 8;
    } else if (Math.random() < 0.5) {
      const k = Math.floor(Math.random() * (STAGES - 1));
      x = CLUSTERS[k][0] + gauss() * 6; y = CLUSTERS[k][1] + gauss() * 6;
      z = -STAGE * (k + 1) + gauss() * 8;
    } else {
      x = rand(-19, 19); y = rand(-12, 12); z = rand(zEnd, -10);
    }
    home.set([x, y, z], i * 3);
    size[i] = rand(0.55, 1.5) * (small ? 1.15 : 1);
    tone[i] = 0;
    phase[i] = rand(0, Math.PI * 2);
    delay[i] = Math.random();
  }

  /* Aristas entre vecinos cercanos */
  const seen = new Set();
  const edges = [];
  const adj = Array.from({ length: N }, () => []);
  for (let i = 0; i < N; i++) {
    const near = [];
    for (let j = 0; j < N; j++) {
      if (i === j) continue;
      const dx = home[i * 3] - home[j * 3];
      const dy = home[i * 3 + 1] - home[j * 3 + 1];
      const dz = home[i * 3 + 2] - home[j * 3 + 2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < 120) near.push([d, j]);
    }
    near.sort((a, b) => a[0] - b[0]);
    near.slice(0, 3).forEach(([, j]) => {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) return;
      seen.add(key);
      adj[i].push(edges.length);
      adj[j].push(edges.length);
      edges.push([i, j]);
    });
  }
  const E = edges.length;
  const linePos = new Float32Array(E * 6);
  const lineGlow = new Float32Array(E * 2);

  const uniforms = { uPR: { value: pr }, uDim: { value: 1 } };
  const blend = { transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending };
  const pointMat = new THREE.ShaderMaterial({ uniforms, vertexShader: POINT_VS, fragmentShader: POINT_FS, ...blend });
  const lineMat = new THREE.ShaderMaterial({ uniforms, vertexShader: LINE_VS, fragmentShader: LINE_FS, ...blend });

  const makePoints = (p, s, g, t) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(s, 1));
    geo.setAttribute('aGlow', new THREE.BufferAttribute(g, 1));
    geo.setAttribute('aTone', new THREE.BufferAttribute(t, 1));
    const pts = new THREE.Points(geo, pointMat);
    pts.frustumCulled = false;
    scene.add(pts);
    return geo;
  };
  const makeLines = (p, g) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('aGlow', new THREE.BufferAttribute(g, 1));
    const seg = new THREE.LineSegments(geo, lineMat);
    seg.frustumCulled = false;
    scene.add(seg);
    return geo;
  };

  const nodeGeo = makePoints(pos, size, glow, tone);
  const lineGeo = makeLines(linePos, lineGlow);

  /* Pulsos: mensajes dorados que viajan entre agentes */
  const P = E ? (small ? 16 : 46) : 0;
  const pulsePos = new Float32Array(P * 3);
  const pulseSize = new Float32Array(P).fill(1.5);
  const pulseGlow = new Float32Array(P).fill(0.8);
  const pulseTone = new Float32Array(P).fill(1);
  const pulseGeo = makePoints(pulsePos, pulseSize, pulseGlow, pulseTone);
  const pulses = Array.from({ length: P }, () => ({
    e: Math.floor(Math.random() * E), t: Math.random(), dir: 1, v: rand(0.35, 0.8),
  }));

  /* Nodo central y datos clave */
  const D = orbit ? orbit.items.length : 0;
  const hubPos = new Float32Array((D + 1) * 3);
  const hubSize = new Float32Array(D + 1).fill(1.5);
  const hubGlow = new Float32Array(D + 1).fill(0.7);
  const hubTone = new Float32Array(D + 1).fill(0);
  hubTone[0] = 1;
  const hubLine = new Float32Array(D * 6);
  const hubLineGlow = new Float32Array(D * 2).fill(0.62);
  const hubGeo = orbit ? makePoints(hubPos, hubSize, hubGlow, hubTone) : null;
  const hubLineGeo = orbit ? makeLines(hubLine, hubLineGlow) : null;
  const ANG = [150, 192, 228, 30, -8, -48].map((d) => (d * Math.PI) / 180);
  const DZ = [-2, 1, -1, 1, -1, 0.5];
  let hub = [0, 0];
  let wpp0 = 0.02;
  let rx = 300;
  let ry = 170;

  const pxToWorld = (sx, sy, z = 0) => {
    const half = tanH * (CAM_START - z);
    return [(sx / W * 2 - 1) * half * (W / H), -(sy / H * 2 - 1) * half];
  };

  let nameEl = null;

  function measureName() {
    nameEl = document.querySelector('[data-name]');
    const rect = nameEl.getBoundingClientRect();
    const cs = getComputedStyle(nameEl);
    const fs = parseFloat(cs.fontSize);
    const top = rect.top + scrollY;
    const cv = document.createElement('canvas');
    const scale = Math.min(1, 900 / rect.width);
    cv.width = Math.ceil(rect.width * scale);
    cv.height = Math.ceil(rect.height * scale);
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.font = `${cs.fontWeight} ${fs * scale}px "Mona Sans"`;
    if ('fontStretch' in ctx && !small) ctx.fontStretch = 'expanded';
    if ('letterSpacing' in ctx) ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : `${parseFloat(cs.letterSpacing) * scale}px`;
    ctx.textBaseline = 'alphabetic';
    const text = nameEl.textContent.trim();
    const m = ctx.measureText(text);
    const base = (cv.height - m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2 + m.fontBoundingBoxAscent;
    const fit = cv.width / m.width;
    ctx.setTransform(fit, 0, 0, 1, 0, 0);
    ctx.fillText(text, 0, base);
    const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const pts = [];
    const step = Math.max(2, Math.round(fs * scale / 42));
    for (let y = 0; y < cv.height; y += step) {
      for (let x = 0; x < cv.width; x += step) {
        if (data[(y * cv.width + x) * 4 + 3] > 128) pts.push([x / scale, y / scale]);
      }
    }
    if (!pts.length) return;
    for (let i = pts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pts[i], pts[j]] = [pts[j], pts[i]];
    }
    for (let i = 0; i < NAME; i++) {
      const [px, py] = pts[i % pts.length];
      const [wx, wy] = pxToWorld(rect.left + px, top + py);
      target[i * 2] = wx;
      target[i * 2 + 1] = wy;
    }
  }

  function measureHub() {
    if (!orbit) return;
    const r = orbit.anchor.getBoundingClientRect();
    rx = Math.max(190, Math.min(r.width * 0.34, 300));
    ry = Math.min(r.height * 0.4, 175);
    const cx = r.left + r.width * 0.5;
    const cy = r.top + scrollY + r.height * 0.5;
    hub = pxToWorld(cx, cy);
    wpp0 = (2 * tanH * CAM_START) / H;
    orbit.items.forEach((el, i) => el.classList.toggle('is-west', Math.cos(ANG[i]) < 0));
  }

  let docMax = 1;
  function measure() {
    docMax = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  }

  /* Estado vivo */
  const intro = { v: 0 };
  let dimTarget = 1;
  let dim = 1;
  let camP = 0;
  let pmx = 0;
  let pmy = 0;
  let mx = 0;
  let my = 0;
  let px = -9999;
  let py = -9999;
  let running = false;
  let raf = 0;
  let last = performance.now();
  let slow = 0;
  let frames = 0;

  function draw(t, dt) {
    const y0 = scrollY;
    const p = y0 / docMax;
    camP = calm ? p : camP + (p - camP) * Math.min(1, dt * 5);
    pmx += (mx - pmx) * Math.min(1, dt * 3);
    pmy += (my - pmy) * Math.min(1, dt * 3);
    dim += (dimTarget - dim) * Math.min(1, dt * 3);
    uniforms.uDim.value = dim;

    const camEnd = zEnd + 15;
    const swayK = Math.PI * 3;
    const cz = CAM_START + (camEnd - CAM_START) * camP;
    const fadeOut = clamp((p - 0.9) / 0.1);
    const cx = Math.sin(camP * swayK) * 2.6 * (1 - fadeOut);
    const cy = Math.sin(camP * swayK * 0.66) * 1.5 * (1 - fadeOut);
    const parX = calm ? 0 : pmx * 0.35;
    const parY = calm ? 0 : pmy * 0.2;
    camera.position.set(cx + parX, cy + parY, cz);
    const dirX = Math.cos(camP * swayK) * 3 * (1 - fadeOut) * clamp(y0 / 400);
    const dirY = Math.cos(camP * swayK * 0.66) * 1.6 * (1 - fadeOut) * clamp(y0 / 400);
    camera.lookAt(camera.position.x + dirX, camera.position.y + dirY, cz - 20);
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    const e = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;

    const scrollFade = clamp(y0 / (H * 0.55));
    const R = 220;

    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      const f = 0.25 + (i % 5) * 0.08;
      let x = home[i3] + Math.sin(t * f + phase[i]) * 0.5;
      let y = home[i3 + 1] + Math.cos(t * f * 0.8 + phase[i]) * 0.45;
      let z = home[i3 + 2] + Math.sin(t * f * 0.6 + phase[i] * 2) * 0.4;

      let a = 0;
      if (i < NAME && !calm) {
        const u = clamp(intro.v * 1.6 - delay[i] * 0.6);
        a = smooth(u) * (1 - scrollFade);
        x += (target[i * 2] - x) * a;
        y += (target[i * 2 + 1] - y) * a;
        z += (0 - z) * a;
      }
      amt[i] = a;

      /* Proyección a pantalla para reaccionar al cursor */
      const w = e[3] * x + e[7] * y + e[11] * z + e[15];
      let influence = 0;
      let ox = 0;
      let oy = 0;
      if (w > 0.1 && px > -999) {
        const sx = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / w * 0.5 + 0.5) * W;
        const sy = (1 - ((e[1] * x + e[5] * y + e[9] * z + e[13]) / w * 0.5 + 0.5)) * H;
        const dx = px - sx;
        const dy = py - sy;
        const d = Math.hypot(dx, dy);
        influence = Math.max(0, 1 - d / R);
        influence *= influence;
        const wpp = (2 * tanH * w) / H;
        if (a > 0.3) {
          const k = (-54 * influence * wpp) / Math.max(d, 8);
          ox = dx * k * 1.6;
          oy = -dy * k * 1.6;
        } else {
          ox = dx * wpp * 0.16 * influence;
          oy = -dy * wpp * 0.16 * influence;
        }
      }
      const blendRate = Math.min(1, dt * 7);
      off[i * 2] += (ox - off[i * 2]) * blendRate;
      off[i * 2 + 1] += (oy - off[i * 2 + 1]) * blendRate;
      glow[i] += (influence - glow[i]) * blendRate;

      pos[i3] = x + off[i * 2];
      pos[i3 + 1] = y + off[i * 2 + 1];
      pos[i3 + 2] = z;
    }

    for (let k = 0; k < E; k++) {
      const [a, b] = edges[k];
      const a3 = a * 3;
      const b3 = b * 3;
      const v = k * 6;
      linePos[v] = pos[a3]; linePos[v + 1] = pos[a3 + 1]; linePos[v + 2] = pos[a3 + 2];
      linePos[v + 3] = pos[b3]; linePos[v + 4] = pos[b3 + 1]; linePos[v + 5] = pos[b3 + 2];
      /* Las aristas de los nodos que escriben el nombre se ocultan: su profundidad las descarta */
      const hide = Math.max(amt[a], amt[b]) > 0.04;
      if (hide) {
        linePos[v + 3] = linePos[v]; linePos[v + 4] = linePos[v + 1]; linePos[v + 5] = linePos[v + 2];
      }
      lineGlow[k * 2] = glow[a];
      lineGlow[k * 2 + 1] = glow[b];
    }

    for (let k = 0; k < P; k++) {
      const q = pulses[k];
      q.t += dt * q.v;
      if (q.t >= 1) {
        const [a, b] = edges[q.e];
        const at = q.dir > 0 ? b : a;
        const list = adj[at];
        q.e = list[Math.floor(Math.random() * list.length)];
        q.dir = edges[q.e][0] === at ? 1 : -1;
        q.t = 0;
      }
      const [a, b] = edges[q.e];
      const s = q.dir > 0 ? a : b;
      const g = q.dir > 0 ? b : a;
      const hidden = amt[a] > 0.04 || amt[b] > 0.04;
      pulseSize[k] = hidden ? 0 : 1.5;
      for (let c = 0; c < 3; c++) {
        pulsePos[k * 3 + c] = pos[s * 3 + c] + (pos[g * 3 + c] - pos[s * 3 + c]) * q.t;
      }
    }

    if (orbit) {
      const show = clamp((intro.v - 0.55) / 0.45) * (1 - clamp(y0 / (H * 0.5)));
      orbit.layer.style.opacity = show.toFixed(3);
      orbit.layer.style.visibility = show <= 0.002 ? 'hidden' : 'visible';
      if (show > 0.002) {
        hubPos[0] = hub[0]; hubPos[1] = hub[1]; hubPos[2] = 0;
        const project = (x, y, z) => {
          const w = e[3] * x + e[7] * y + e[11] * z + e[15];
          return [((e[0] * x + e[4] * y + e[8] * z + e[12]) / w * 0.5 + 0.5) * W,
            (1 - ((e[1] * x + e[5] * y + e[9] * z + e[13]) / w * 0.5 + 0.5)) * H];
        };
        const [hx, hy] = project(hub[0], hub[1], 0);
        orbit.core.style.transform = `translate3d(${hx.toFixed(1)}px,${hy.toFixed(1)}px,0)`;
        for (let i = 0; i < D; i++) {
          const th = ANG[i] + (calm ? 0 : Math.sin(t * 0.3 + i * 1.7) * 0.05);
          const x = hub[0] + Math.cos(th) * rx * wpp0;
          const y = hub[1] + Math.sin(th) * ry * wpp0;
          const z = DZ[i];
          hubPos.set([x, y, z], (i + 1) * 3);
          hubLine.set([hub[0], hub[1], 0, x, y, z], i * 6);
          const [sx, sy] = project(x, y, z);
          const west = Math.cos(ANG[i]) < 0;
          orbit.items[i].style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0) translate(${west ? 'calc(-100% - 14px)' : '14px'},-50%)`;
        }
        hubGeo.attributes.position.needsUpdate = true;
        hubLineGeo.attributes.position.needsUpdate = true;
      }
      if (hubGeo) {
        hubGlow.fill(0.7 * show);
        hubSize.fill(show > 0.002 ? 1.5 : 0);
        hubLineGlow.fill(0.62 * show);
        hubGeo.attributes.aGlow.needsUpdate = true;
        hubGeo.attributes.aSize.needsUpdate = true;
        hubLineGeo.attributes.aGlow.needsUpdate = true;
      }
    }

    if (nameEl && !calm && scrollFade < 1) {
      const shift = (parX * H) / (2 * tanH * CAM_START);
      nameEl.style.transform = `translate3d(${(-shift).toFixed(2)}px,0,0)`;
    }

    nodeGeo.attributes.position.needsUpdate = true;
    nodeGeo.attributes.aGlow.needsUpdate = true;
    lineGeo.attributes.position.needsUpdate = true;
    lineGeo.attributes.aGlow.needsUpdate = true;
    if (P) {
      pulseGeo.attributes.position.needsUpdate = true;
      pulseGeo.attributes.aSize.needsUpdate = true;
    }
    renderer.render(scene, camera);
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    draw(now / 1000, dt);
    frames += 1;
    if (dt > 0.03) slow += 1;
    if (frames === 120) {
      if (slow > 70 && pr > 1) {
        pr = 1;
        renderer.setPixelRatio(pr);
        renderer.setSize(W, H, false);
        uniforms.uPR.value = pr;
      }
      frames = 0;
      slow = 0;
    }
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (calm || running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function renderStatic() {
    draw(0, 0.016);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  function layout() {
    measureName();
    measureHub();
    measure();
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    /* En móvil la barra de direcciones cambia solo la altura: no recalcular */
    if (small && innerWidth === W) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      W = innerWidth;
      H = innerHeight;
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      renderer.setSize(W, H, false);
      layout();
      if (calm) renderStatic();
    }, 160);
  });

  layout();

  return {
    intro,
    start,
    renderStatic,
    measure,
    layout,
    setDim(v) {
      /* Sin animación, los nodos no forman el nombre: se atenúan para no competir con el texto */
      dimTarget = calm ? Math.min(v, 0.42) : v;
      if (calm) dim = dimTarget;
    },
    setPointer(x, y) {
      px = x;
      py = y;
      mx = x / W * 2 - 1;
      my = -(y / H * 2 - 1);
    },
  };
}

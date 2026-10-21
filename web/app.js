const TERRAIN_SEG_W = 622;
const TERRAIN_SEG_H = 382;
/**
 * MapBiomas 3D - Distrito Federal (Brasília, Brasil)
 * Interactive Three.js WebGL Terrain Viewer with Satellite, MapBiomas & Procedural 3D Props
 */

// Application State
const state = {
  metadata: null,
  elevationBuffer: null,
  classesBuffer: null,
  exaggeration: 1.0,
  sunAzimuth: 315,
  sunElevation: 30,
  activeLayer: 'blend', // 'satellite', 'blend', 'mapbiomas', 'hypsometric'
  mapbiomasOpacity: 0.65,
  satResolution: '8k', // '4k', '8k', '12k'
  turntable: false,
  wireframe: false,
  demDimensions: { width: 3738, height: 2294 },
  terrainSpan: { width: 200, height: 122.74 },
  baseHeight: 1.1847, // 1:1 Real Metric Scale (699m / 49500m * 200 = 2.82424 Three.js units)
  totalPropsCount: 0,
  activePropsCount: 0,
  visibleChunksCount: 0,
  terrainLod: 'ultra', // 'ultra' (622x382), 'balanced' (311x191), 'fast' (155x95)
  dataLod: 'full', // 'full' (DEM 30m) ou 'lod1' (meia-resolução)
  lodChunks: [],
  lod: {
    enabled: true,
    frustumCulling: true,
    nearDistance: 35.0, // < 35 units = LOD 0 (3D Sólido completo + micro-props)
    farDistance: 70.0   // 35-70 units = LOD 1 (Impostores 2.5D), > 70 units = LOD 2
  },
  roads: { enabled: true, tier1: true, tier2: true, tier3: true },
  landmarks: { enabled: true, scale: 1.0 },
  props: {
    enabled: true,
    castShadows: true,
    scale: 1.0,
    density: 1.0, // Multiplicador de densidade de vegetação e props por pixel (1.0x, 1.5x, 2.0x, 2.5x)
    categories: {
      forest: true,
      cerrado: true,
      rocks: true,
      pasture: true,
      silviculture: true,
      grassland: true,
      urban: true,
      soybean: true,
      tempcrops: true,
      wetland: true,
      bare: true,
      water: true,
      cattle: true,
      machinery: true
    }
  }
};

let scene, camera, renderer, controls;
let terrainMesh, overlayMesh, terrainGeometry, rawElevations, rawClasses;
let propsGroup;
const propLayers = {}; // { forest: { mesh, items }, ... }
let sunLight, ambientLight;
let sky, sunVector, cloudMesh;
let textures = {};

// DOM Elements
const progressBar = document.getElementById('progress-bar');
const loadingStatus = document.getElementById('loading-status');
const loadingOverlay = document.getElementById('loading-overlay');
const sliderExaggeration = document.getElementById('slider-exaggeration');
const valExaggeration = document.getElementById('val-exaggeration');
const sliderSunAzimuth = document.getElementById('slider-sun-azimuth');
const valSunAzimuth = document.getElementById('val-sun-azimuth');
const sliderSunElevation = document.getElementById('slider-sun-elevation');
const valSunElevation = document.getElementById('val-sun-elevation');
const sliderOpacity = document.getElementById('slider-opacity');
const valOpacity = document.getElementById('val-opacity');
const compassRose = document.getElementById('compass-rose');
const compassWidget = document.getElementById('compass-widget');
const btnResetView = document.getElementById('btn-reset-view');
const checkTurntable = document.getElementById('check-turntable');
const checkWireframe = document.getElementById('check-wireframe');
const btnTogglePanel = document.getElementById('btn-toggle-panel');
const controlPanel = document.getElementById('control-panel');
const btnShowPanel = document.getElementById('btn-show-panel');
const legendPanel = document.getElementById('legend-panel');
const btnToggleLegend = document.getElementById('btn-toggle-legend');
const btnShowLegend = document.getElementById('btn-show-legend');
const btnToggleAllMenus = document.getElementById('btn-toggle-all-menus');
const labelToggleAll = document.getElementById('label-toggle-all');
const iconToggleAll = document.getElementById('icon-toggle-all');
const legendContainer = document.getElementById('legend-items-container');

// Props DOM Elements
const checkProps = document.getElementById('check-props');
const checkPropsShadows = document.getElementById('check-props-shadows');
const sliderPropScale = document.getElementById('slider-prop-scale');
const valPropScale = document.getElementById('val-prop-scale');
const badgePropsCount = document.getElementById('badge-props-count');
const sliderPropDensity = document.getElementById('slider-prop-density');
const sliderPropDensitySettings = document.getElementById('slider-prop-density-settings');
const valPropDensity = document.getElementById('val-prop-density');
const valPropDensitySettings = document.getElementById('val-prop-density-settings');
const badgeDensityMultiplier = document.getElementById('badge-density-multiplier');
const densityHelperText = document.getElementById('density-helper-text');

// Settings Panel DOM Elements
const settingsPanel = document.getElementById('settings-panel');
const btnOpenSettings = document.getElementById('btn-open-settings');
const btnOpenSettingsSide = document.getElementById('btn-open-settings-side');
const btnCloseSettings = document.getElementById('btn-close-settings');

// LOD DOM Elements
const checkLodEnabled = document.getElementById('check-lod-enabled');
const checkLodFrustum = document.getElementById('check-lod-frustum');
const badgeLodMode = document.getElementById('badge-lod-mode');
const statLodChunks = document.getElementById('stat-lod-chunks');
const statLodProps = document.getElementById('stat-lod-props');
const statLodSavings = document.getElementById('stat-lod-savings');
const badgeTerrainLod = document.getElementById('badge-terrain-lod');
const badgeDataLod = document.getElementById('badge-data-lod');

// 1. Boot Application
window.addEventListener('DOMContentLoaded', init);

async function init() {
  updateProgress(10, 'Carregando metadados geográficos...');
  
  try {
    const metaResp = await fetch('public/metadata.json');
    state.metadata = await metaResp.json();
    if (state.metadata && state.metadata.elevation) {
      state.demDimensions = { width: state.metadata.width, height: state.metadata.height };
      const aspect = state.metadata.height / state.metadata.width;
      state.terrainSpan = { width: 200, height: 200 * aspect };
      const realWidthM = state.metadata.width * (state.metadata.res_x || 30.0);
      state.baseHeight = state.metadata.elevation.span_m * (state.terrainSpan.width / realWidthM);
    }
    populateHUDMetadata(state.metadata);

    updateProgress(25, 'Inicializando motor 3D...');
    initThreeScene();

    updateProgress(40, 'Carregando imagens de satélite e MapBiomas...');
    await loadTextures();

    updateProgress(55, 'Carregando classes de cobertura do MapBiomas (Col. 11)...');
    await loadClassesData();

    updateProgress(70, 'Carregando malha altimétrica do relevo (DEM Copernicus)...');
    await loadElevationData();

    updateProgress(82, 'Construindo terreno 3D e calculando normais...');
    buildTerrainMesh();

    updateProgress(90, 'Distribuindo vegetação, rochas e props 3D procedurais...');
    buildPropsMeshes();

    updateProgress(95, 'Carregando malha viária OSM e marcos arquitetônicos 3D...');
    await loadRoadsNetwork();
    await loadOSMLandmarks();
    await loadDFBoundary();

    updateProgress(100, 'Pronto!');
    setTimeout(() => {
      loadingOverlay.classList.add('fade-out');
      setTimeout(() => { loadingOverlay.style.display = 'none'; }, 600);
    }, 300);

    setupEventListeners();
    animate();

    const urlParams = new URLSearchParams(window.location.search);
    const layerParam = urlParams.get('layer');
    if (layerParam) {
      state.activeLayer = layerParam;
      document.querySelectorAll('#btn-group-layer .seg-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.layer === layerParam);
      });
      applyLayerMode();
    }
    const resParam = urlParams.get('res');
    if (resParam && ['4k', '8k', '12k'].includes(resParam.toLowerCase())) {
      setTimeout(() => setSatelliteResolution(resParam.toLowerCase()), 300);
    }
    const viewParam = urlParams.get('view');
    if (viewParam) {
      setTimeout(() => setCameraPreset(viewParam), 400);
    }
    const statsParam = urlParams.get('stats');
    if (statsParam) {
      setTimeout(() => {
        const m = document.getElementById('modal-stats');
        if (m) m.classList.add('active');
      }, 500);
    }

  } catch (err) {
    console.error('Initialization error:', err);
    loadingStatus.textContent = 'Erro ao carregar dados: ' + err.message;
    loadingStatus.style.color = '#ef4444';
  }
}

function updateProgress(pct, msg) {
  if (progressBar) progressBar.style.width = pct + '%';
  if (loadingStatus) loadingStatus.textContent = msg;
}

function safeSetText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// 2. Populate HUD from metadata.json
function populateHUDMetadata(meta) {
  if (meta.elevation) {
    safeSetText('stat-relief', meta.elevation.span_m.toLocaleString('pt-BR') + ' m');
    safeSetText('stat-max-elev', meta.elevation.max_m.toLocaleString('pt-BR') + ' m');
  }
  if (meta.classes) {
    safeSetText('legend-total-classes', meta.classes.length + ' classes');
  }

  if (meta.statistics) {
    safeSetText('stat-total-area', meta.statistics.total_area_ha.toLocaleString('pt-BR') + ' ha');
  }

  legendContainer.innerHTML = '';
  meta.classes.forEach(c => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.dataset.classId = c.id;
    const haText = c.area_ha ? c.area_ha.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' ha' : '';
    item.innerHTML = `
      <div class="legend-item-left">
        <div class="color-swatch" style="background-color: ${c.hex};"></div>
        <span class="class-name" title="${c.name_pt}">${c.name_pt}</span>
      </div>
      <div class="legend-item-right">
        <span class="class-pct">${c.percentage.toFixed(1)}%</span>
        ${haText ? `<span class="class-ha">${haText}</span>` : ''}
      </div>
    `;
    legendContainer.appendChild(item);
  });

  populateStatsModal(meta);
}

// Preenchimento dinâmico do Modal de Estatísticas Territoriais
function populateStatsModal(meta) {
  if (!meta || !meta.statistics) return;
  const stats = meta.statistics;

  // 1. KPI Cards
  const kpiTotalHa = document.getElementById('kpi-total-ha');
  const kpiTotalKm2 = document.getElementById('kpi-total-km2');
  if (kpiTotalHa) kpiTotalHa.textContent = stats.total_area_ha.toLocaleString('pt-BR') + ' ha';
  if (kpiTotalKm2) kpiTotalKm2.textContent = `${stats.total_area_km2.toLocaleString('pt-BR')} km² • ${stats.total_pixels.toLocaleString('pt-BR')} px (30m)`;

  const grpMap = {};
  stats.groups.forEach(g => { grpMap[g.name] = g; });

  const agro = grpMap['Agropecuária'];
  if (agro) {
    const elHa = (document.getElementById('kpi-agro-ha') || document.getElementById('kpi-agri-ha'));
    const elPct = (document.getElementById('kpi-agro-pct') || document.getElementById('kpi-agri-pct'));
    if (elHa) elHa.textContent = agro.area_ha.toLocaleString('pt-BR') + ' ha';
    if (elPct) elPct.textContent = `${agro.percentage.toFixed(2)}% do território`;
  }

  const nativa = grpMap['Vegetação Nativa'];
  if (nativa) {
    const elHa = document.getElementById('kpi-native-ha');
    const elPct = document.getElementById('kpi-native-pct');
    if (elHa) elHa.textContent = nativa.area_ha.toLocaleString('pt-BR') + ' ha';
    if (elPct) elPct.textContent = `${nativa.percentage.toFixed(2)}% do território`;
  }

  const urban = grpMap['Áreas Não Vegetadas'];
  if (urban) {
    const elHa = document.getElementById('kpi-urban-ha');
    const elPct = document.getElementById('kpi-urban-pct');
    if (elHa) elHa.textContent = urban.area_ha.toLocaleString('pt-BR') + ' ha';
    if (elPct) elPct.textContent = `${urban.percentage.toFixed(2)}% (Urbano & Exposto)`;
  }

  const agua = grpMap['Corpos Hídricos'];
  if (agua) {
    const elHa = document.getElementById('kpi-water-ha');
    const elPct = document.getElementById('kpi-water-pct');
    if (elHa) elHa.textContent = agua.area_ha.toLocaleString('pt-BR') + ' ha';
    if (elPct) elPct.textContent = `${agua.percentage.toFixed(2)}% (Rios & Represas)`;
  }

  // 2. Barra de Distribuição Macrogrupal
  const distBar = document.getElementById('distribution-bar');
  const distLegend = document.getElementById('distribution-legend');
  if (distBar && distLegend) {
    distBar.innerHTML = '';
    distLegend.innerHTML = '';
    stats.groups.forEach(g => {
      const seg = document.createElement('div');
      seg.className = 'dist-segment';
      seg.style.width = g.percentage + '%';
      seg.style.backgroundColor = g.color;
      seg.title = `${g.name}: ${g.percentage.toFixed(2)}% (${g.area_ha.toLocaleString('pt-BR')} ha)`;
      distBar.appendChild(seg);

      const leg = document.createElement('div');
      leg.className = 'dist-legend-item';
      leg.innerHTML = `
        <span class="dist-legend-dot" style="background-color: ${g.color};"></span>
        <span class="dist-legend-label">${g.name}:</span>
        <span class="dist-legend-val">${g.percentage.toFixed(1)}% <span style="font-weight: 400; color: var(--text-muted); font-size: 11px;">(${g.area_ha.toLocaleString('pt-BR')} ha)</span></span>
      `;
      distLegend.appendChild(leg);
    });
  }

  // 3. Tabela Completa de Todas as 13 Classes
  const tbody = document.getElementById('stats-table-body');
  if (tbody) {
    tbody.innerHTML = '';
    meta.classes.forEach(c => {
      const tr = document.createElement('tr');
      const grpColor = c.group === 'Vegetação Nativa' ? '#10b981' :
                       c.group === 'Agropecuária' ? '#f59e0b' :
                       c.group === 'Corpos Hídricos' ? '#3b82f6' : '#ef4444';
      tr.innerHTML = `
        <td>
          <div class="class-cell">
            <div class="color-swatch" style="background-color: ${c.hex};"></div>
            <span>${c.name_pt}</span>
          </div>
        </td>
        <td style="color: var(--text-muted); font-weight: 600;">${c.id}</td>
        <td>
          <span class="group-tag" style="background: ${grpColor}22; color: ${grpColor}; border: 1px solid ${grpColor}44;">
            ${c.group || 'Geral'}
          </span>
        </td>
        <td class="num-col">${c.count.toLocaleString('pt-BR')}</td>
        <td class="num-col" style="font-weight: 600; color: #fff;">${(c.area_ha || c.count * 0.09).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
        <td class="num-col">${(c.area_km2 || (c.count * 0.09) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="num-col" style="font-weight: 700; color: var(--accent-green);">${c.percentage.toFixed(2)}%</td>
        <td>
          <div class="pct-bar-bg" title="${c.percentage.toFixed(2)}%">
            <div class="pct-bar-fill" style="width: ${Math.min(100, Math.max(1, c.percentage * 1.8))}%; background-color: ${c.hex};"></div>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
}

// Criador procedural de textura de nuvens tropicais
function createCloudTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 45; i++) {
    const cx = Math.random() * size;
    const cy = Math.random() * size;
    const r = 40 + Math.random() * 65;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const alpha = 0.08 + Math.random() * 0.12;
    grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    grad.addColorStop(0.5, `rgba(248, 252, 255, ${alpha * 0.45})`);
    grad.addColorStop(1, 'rgba(240, 248, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  return texture;
}

// 3. Initialize Three.js Viewport
function initThreeScene() {
  const container = document.getElementById('canvas-container');
  const w = window.innerWidth;
  const h = window.innerHeight;

  scene = new THREE.Scene();

  // Céu Realista do Planalto Central ("O Mar de Brasília")
  // Domo atmosférico físico com dispersão de Rayleigh, coroa de Mie e disco solar dinâmico
  sky = createRealisticBrasiliaSky();
  sunVector = new THREE.Vector3();
  scene.fog = null;

  // Camada de nuvens cúmulus de alta altitude
  const cloudGeo = new THREE.PlaneGeometry(850, 850);
  const cloudMat = new THREE.MeshBasicMaterial({
    map: createCloudTexture(),
    transparent: true,
    opacity: 0.20,
    depthWrite: false
  });
  cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
  cloudMesh.rotation.x = -Math.PI / 2;
  cloudMesh.position.set(0, 52, 0);
  // scene.add(cloudMesh);

  camera = new THREE.PerspectiveCamera(40, w / h, 0.5, 2000000);
  camera.position.set(-35, 65, 95);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.minDistance = 2;
  controls.maxDistance = 450;
  controls.target.set(0, 0.5, 0);

  // Lighting
  ambientLight = new THREE.HemisphereLight(0xdde9ff, 0x1a2130, 0.65);
  scene.add(ambientLight);

  sunLight = new THREE.DirectionalLight(0xfff3db, 2.3);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 400;
  const d = 110;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.bias = -0.0004;
  scene.add(sunLight);

  updateSunPosition();
  window.addEventListener('resize', onWindowResize);
}


// 3.1 Criação do Domo de Céu Realista ("O Céu de Brasília")
function createRealisticBrasiliaSky() {
  const vertexShader = `
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform vec3 topColor;
    uniform vec3 horizonColor;
    uniform vec3 groundHazeColor;
    uniform vec3 sunColor;
    uniform vec3 sunPosition;
    varying vec3 vWorldPosition;

    void main() {
      vec3 viewDir = normalize(vWorldPosition);
      vec3 sunDir = normalize(sunPosition);

      // Curva natural de dispersão de Rayleigh na atmosfera
      float h = max(0.0, viewDir.y);
      float gradient = pow(h, 0.40);

      // Gradiente atmosférico do azul zênite ao brilho suave do horizonte
      vec3 skyCol = mix(horizonColor, topColor, gradient);

      if (viewDir.y < 0.0) {
        float groundH = clamp(-viewDir.y * 3.5, 0.0, 1.0);
        skyCol = mix(horizonColor, groundHazeColor, groundH);
      }

      // Disco Solar Realista e Coroa de Mie (Rayleigh + Mie Scattering)
      float cosTheta = dot(viewDir, sunDir);
      if (sunPosition.y > -0.05) {
        float sunDisk = smoothstep(0.9997, 0.99995, cosTheta);
        float sunHalo = pow(max(0.0, cosTheta), 40.0) * 0.40 + pow(max(0.0, cosTheta), 6.0) * 0.12;
        skyCol += sunColor * (sunDisk * 2.8 + sunHalo);
      }

      gl_FragColor = vec4(skyCol, 1.0);
    }
  `;

  const skyGeo = new THREE.SphereGeometry(600000, 32, 24);
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    uniforms: {
      topColor: { value: new THREE.Color(0x1963c6) },       // Azul zênite vibrante do Planalto Central
      horizonColor: { value: new THREE.Color(0xd4e7f8) },   // Azul claro horizonte
      groundHazeColor: { value: new THREE.Color(0x8fa3b8) },
      sunColor: { value: new THREE.Color(0xfffaed) },
      sunPosition: { value: new THREE.Vector3(100, 100, 100) }
    },
    side: THREE.BackSide,
    depthWrite: false
  });

  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyDome);
  return skyDome;
}

// Update Sun Direction and Atmospheric Colors
function updateSunPosition() {
  const azRad = THREE.MathUtils.degToRad(state.sunAzimuth);
  const elRad = THREE.MathUtils.degToRad(state.sunElevation);
  const dist = 140;

  const x = dist * Math.cos(elRad) * Math.sin(azRad);
  const y = dist * Math.sin(elRad);
  const z = dist * Math.cos(elRad) * Math.cos(azRad);

  sunLight.position.set(x, y, z);
  sunLight.target.position.set(0, 0, 0);
  sunLight.target.updateMatrixWorld();

  if (sky && sky.material && sky.material.uniforms && sunVector) {
    const phi = THREE.MathUtils.degToRad(90 - state.sunElevation);
    const theta = THREE.MathUtils.degToRad(state.sunAzimuth);
    sunVector.setFromSphericalCoords(100, phi, theta);
    if (sky.material.uniforms['sunPosition']) {
      sky.material.uniforms['sunPosition'].value.copy(sunVector);
    }

    // Adaptação dinâmica de cores do céu com a elevação solar (alvorada, meio-dia, pôr do sol)
    const elevNorm = Math.max(0, Math.min(1, state.sunElevation / 45));
    if (sky.material.uniforms['topColor'] && sky.material.uniforms['horizonColor']) {
      const middayTop = new THREE.Color(0x155ebd);
      const middayHorizon = new THREE.Color(0xcbe3f7);
      const sunsetTop = new THREE.Color(0x282a6e);
      const sunsetHorizon = new THREE.Color(0xfba266);

      sky.material.uniforms['topColor'].value.lerpColors(sunsetTop, middayTop, elevNorm);
      sky.material.uniforms['horizonColor'].value.lerpColors(sunsetHorizon, middayHorizon, elevNorm);
    }
  }

  // Neblina dinâmica e iluminação ambiente adaptativa (alvorada/poente vs meio-dia)
  const elevNorm = Math.max(0, Math.min(1, state.sunElevation / 45));
  const sunsetFog = new THREE.Color(0xe89e70);
  const middayFog = new THREE.Color(0xb2d2ea);
  const currentFog = new THREE.Color().lerpColors(sunsetFog, middayFog, elevNorm);

  if (scene.fog) {
    scene.fog.color.copy(currentFog);
  }

  if (ambientLight) {
    const skyAmb = new THREE.Color().lerpColors(new THREE.Color(0xffbf88), new THREE.Color(0xdceaff), elevNorm);
    const groundAmb = new THREE.Color().lerpColors(new THREE.Color(0x3a2214), new THREE.Color(0x223026), elevNorm);
    ambientLight.color.copy(skyAmb);
    ambientLight.groundColor.copy(groundAmb);
    ambientLight.intensity = 0.45 + elevNorm * 0.35;
  }

  if (sunLight) {
    const sunColor = new THREE.Color().lerpColors(new THREE.Color(0xffaa5e), new THREE.Color(0xfffaed), elevNorm);
    sunLight.color.copy(sunColor);
    sunLight.intensity = 1.3 + elevNorm * 1.2;
  }
}

// 4. Load Textures (Satellite + MapBiomas + Hypsometric + Detail Normal)
async function loadTextures() {
  const loader = new THREE.TextureLoader();

  const loadTex = (url) => new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });

  // Load Satellite Imagery Texture (8K Ultra-Sharp Baseline: 8192 x 4205 px)
  const satTex = await loadTex('public/satellite_texture_4k.jpg');
  satTex.generateMipmaps = true;
  satTex.minFilter = THREE.LinearMipmapLinearFilter;
  satTex.magFilter = THREE.LinearFilter;
  const maxAniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;
  satTex.anisotropy = maxAniso;
  textures.satellite = satTex;
  textures.sat4k = satTex;

  // Load MapBiomas Classes Texture
  const mbTex = await loadTex('public/mapbiomas_texture.png');
  mbTex.generateMipmaps = true;
  mbTex.minFilter = THREE.LinearMipmapLinearFilter;
  mbTex.magFilter = THREE.LinearFilter;
  mbTex.anisotropy = maxAniso;
  textures.mapbiomas = mbTex;

  // Procedural hypsometric texture
  textures.hypsometric = generateHypsometricTexture();

  // Procedural detail normal map for micro-topography & pasture grass relief
  textures.normalDetail = generateTerrainNormalMap();

  // Load High-Res Impostor Textures for Hierarchical LOD (2.5D Billboards)
  textures.impostors = {};
  const impostorList = [
    { key: 'forest', file: 'tree_tropical.png' },
    { key: 'cerrado_tree', file: 'tree_cerrado.png' },
    { key: 'cerrado_shrub', file: 'shrub_cerrado.png' },
    { key: 'silviculture', file: 'tree_eucalyptus.png' },
    { key: 'rocks', file: 'rock_rupestre.png' }
  ];

  await Promise.all(impostorList.map(async item => {
    try {
      const tex = await loadTex(`public/impostors/${item.file}`);
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      textures.impostors[item.key] = tex;
    } catch (err) {
      console.warn(`Impostor texture ${item.file} não carregada:`, err);
    }
  }));
}

function generateHypsometricTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 255, 0, 0);

  grad.addColorStop(0.00, '#155e37'); // 360m (Matas e vales)
  grad.addColorStop(0.25, '#4ade80'); // 500m (Savana e cerrado)
  grad.addColorStop(0.50, '#facc15'); // 700m (Encostas)
  grad.addColorStop(0.75, '#ea580c'); // 900m (Platôs rochosos)
  grad.addColorStop(0.92, '#78350f'); // 1000m (Escarpa de quartzo)
  grad.addColorStop(1.00, '#f8fafc'); // 1060m (Picos)

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function generateTerrainNormalMap() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(512, 512);
  const data = imgData.data;

  // Gerador de relevo microtopográfico de campo e lâminas de pasto
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const idx = (y * 512 + x) * 4;
      const g1 = Math.sin(x * 0.22) * Math.cos(y * 0.22) * 14;
      const g2 = Math.sin(x * 0.07 + y * 0.05) * 10;
      const g3 = (Math.sin(x * 0.55) + Math.cos(y * 0.55)) * 6;
      const nx = g1 + g2 + g3 + 128;
      const ny = (Math.cos(x * 0.22) * Math.sin(y * 0.22) * 14 + g2 + g3) + 128;

      data[idx] = Math.min(255, Math.max(0, nx));
      data[idx + 1] = Math.min(255, Math.max(0, ny));
      data[idx + 2] = 246;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(48, 24);
  return tex;
}

// 5. Load Binary Classes & Elevation Buffers
async function loadClassesData() {
  const resp = await fetch('public/classes.bin');
  const buffer = await resp.arrayBuffer();
  rawClasses = new Uint8Array(buffer);
}

async function loadElevationData() {
  const resp = await fetch('public/elevation.bin');
  const buffer = await resp.arrayBuffer();
  rawElevations = new Float32Array(buffer);
}

// 6. Bilinear DEM Elevation Interpolation: garante relevo e instâncias assentadas com precisão contínua
function getBilinearElevation(normU, normV, demW, demH) {
  const fx = Math.max(0, Math.min(demW - 1, normU * (demW - 1)));
  const fz = Math.max(0, Math.min(demH - 1, normV * (demH - 1)));
  const x0 = Math.floor(fx);
  const x1 = Math.min(demW - 1, x0 + 1);
  const z0 = Math.floor(fz);
  const z1 = Math.min(demH - 1, z0 + 1);
  const dx = fx - x0;
  const dz = fz - z0;

  const e00 = rawElevations[z0 * demW + x0] || 0.0;
  const e10 = rawElevations[z0 * demW + x1] || 0.0;
  const e01 = rawElevations[z1 * demW + x0] || 0.0;
  const e11 = rawElevations[z1 * demW + x1] || 0.0;

  return (e00 * (1 - dx) + e10 * dx) * (1 - dz) + (e01 * (1 - dx) + e11 * dx) * dz;
}

// 7. Build 3D Terrain Meshes (Base Satellite + Overlaid MapBiomas)
// Malha de alta fidelidade: 825x423 segmentos (350.000+ vértices) para reproduzir microtopografia nítida
// Suporta LOD Dinâmico de Malha: Ultra (622x382), Equilibrado (311x191), Leve (155x95)
function buildTerrainMesh(customSegW, customSegH) {
  let segW = customSegW;
  let segH = customSegH;

  if (!segW || !segH) {
    if (state.terrainLod === 'balanced') {
      segW = 311; segH = 191;
    } else if (state.terrainLod === 'fast') {
      segW = 155; segH = 95;
    } else {
      segW = 622; segH = 382;
    }
  }

  const geoW = state.terrainSpan.width;
  const geoH = state.terrainSpan.height;

  const newGeometry = new THREE.PlaneGeometry(geoW, geoH, segW, segH);
  newGeometry.rotateX(-Math.PI / 2);

  const posAttr = newGeometry.attributes.position;
  const count = posAttr.count;

  const demW = state.demDimensions.width;
  const demH = state.demDimensions.height;

  for (let i = 0; i < count; i++) {
    const col = i % (segW + 1);
    const row = Math.floor(i / (segW + 1));
    const normU = col / segW;
    const normV = row / segH;
    const normElev = getBilinearElevation(normU, normV, demW, demH);
    const heightVal = normElev * state.baseHeight * state.exaggeration;
    posAttr.setY(i, heightVal);
  }

  posAttr.needsUpdate = true;
  newGeometry.computeVertexNormals();

  if (terrainGeometry) terrainGeometry.dispose();
  terrainGeometry = newGeometry;

  if (terrainMesh && overlayMesh) {
    terrainMesh.geometry = terrainGeometry;
    overlayMesh.geometry = terrainGeometry;
    buildTerrainSkirt();
    return;
  }

  // Base Terrain Mesh (Satellite)
  const baseMat = new THREE.MeshStandardMaterial({
    map: textures.satellite,
    normalMap: textures.normalDetail,
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 0.80,
    metalness: 0.04,
    wireframe: state.wireframe
  });

  terrainMesh = new THREE.Mesh(terrainGeometry, baseMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = true;
  scene.add(terrainMesh);

  // Overlay Mesh (MapBiomas with variable opacity)
  const overlayMat = new THREE.MeshStandardMaterial({
    map: textures.mapbiomas,
    normalMap: textures.normalDetail,
    normalScale: new THREE.Vector2(0.5, 0.5),
    transparent: true,
    opacity: state.mapbiomasOpacity,
    roughness: 0.80,
    metalness: 0.04,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });

  overlayMesh = new THREE.Mesh(terrainGeometry, overlayMat);
  overlayMesh.receiveShadow = true;
  scene.add(overlayMesh);

  buildTerrainSkirt();
  applyLayerMode();
}

// 7.1 Pedestal / Saia Vertical da Maquete 3D Arquitetônica
// Conecta os vértices de borda do relevo diretamente a uma base plana sólida, eliminando lacunas e bordas flutuantes
function buildTerrainSkirt() {
  if (skirtMesh) {
    scene.remove(skirtMesh);
    if (skirtGeometry) skirtGeometry.dispose();
  }

  const segW = terrainGeometry && terrainGeometry.parameters ? terrainGeometry.parameters.widthSegments : 622;
  const segH = terrainGeometry && terrainGeometry.parameters ? terrainGeometry.parameters.heightSegments : 382;
  const geoW = state.terrainSpan.width;
  const geoH = state.terrainSpan.height;
  const demW = state.demDimensions.width;
  const demH = state.demDimensions.height;
  const yBase = -1.5; // Base sólida do pedestal da maquete física

  const positions = [];
  rawSkirtEdgeMap = [];

  function addSkirtQuad(x1, z1, u1, v1, x2, z2, u2, v2) {
    const e1 = getBilinearElevation(u1, v1, demW, demH) * state.baseHeight * state.exaggeration;
    const e2 = getBilinearElevation(u2, v2, demW, demH) * state.baseHeight * state.exaggeration;

    const startIdx = positions.length / 3;

    // Triângulo 1: topo 1 -> base 1 -> base 2
    positions.push(x1, e1, z1);
    rawSkirtEdgeMap.push({ idx: startIdx + 0, u: u1, v: v1 });
    positions.push(x1, yBase, z1);
    positions.push(x2, yBase, z2);

    // Triângulo 2: topo 1 -> base 2 -> topo 2
    positions.push(x1, e1, z1);
    rawSkirtEdgeMap.push({ idx: startIdx + 3, u: u1, v: v1 });
    positions.push(x2, yBase, z2);
    positions.push(x2, e2, z2);
    rawSkirtEdgeMap.push({ idx: startIdx + 5, u: u2, v: v2 });
  }

  // 1. Borda Norte (linha 0, de col 0 a segW): z = -geoH / 2
  const zN = -geoH / 2;
  for (let c = 0; c < segW; c++) {
    const u1 = c / segW;
    const u2 = (c + 1) / segW;
    const x1 = (u1 - 0.5) * geoW;
    const x2 = (u2 - 0.5) * geoW;
    addSkirtQuad(x2, zN, u2, 0, x1, zN, u1, 0);
  }

  // 2. Borda Leste (coluna segW, de linha 0 a segH): x = geoW / 2
  const xE = geoW / 2;
  for (let r = 0; r < segH; r++) {
    const v1 = r / segH;
    const v2 = (r + 1) / segH;
    const z1 = (v1 - 0.5) * geoH;
    const z2 = (v2 - 0.5) * geoH;
    addSkirtQuad(xE, z2, 1, v2, xE, z1, 1, v1);
  }

  // 3. Borda Sul (linha segH, de col segW descendo para 0): z = geoH / 2
  const zS = geoH / 2;
  for (let c = segW; c > 0; c--) {
    const u1 = c / segW;
    const u2 = (c - 1) / segW;
    const x1 = (u1 - 0.5) * geoW;
    const x2 = (u2 - 0.5) * geoW;
    addSkirtQuad(x2, zS, u2, 1, x1, zS, u1, 1);
  }

  // 4. Borda Oeste (coluna 0, de linha segH descendo para 0): x = -geoW / 2
  const xW = -geoW / 2;
  for (let r = segH; r > 0; r--) {
    const v1 = r / segH;
    const v2 = (r - 1) / segH;
    const z1 = (v1 - 0.5) * geoH;
    const z2 = (v2 - 0.5) * geoH;
    addSkirtQuad(xW, z2, 0, v2, xW, z1, 0, v1);
  }

  skirtGeometry = new THREE.BufferGeometry();
  skirtGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  skirtGeometry.computeVertexNormals();

  const skirtMat = new THREE.MeshStandardMaterial({
    color: 0x141820, // Cinza ardósia escuro arquitetônico premium
    roughness: 0.92,
    metalness: 0.08,
    side: THREE.DoubleSide
  });

  skirtMesh = new THREE.Mesh(skirtGeometry, skirtMat);
  skirtMesh.receiveShadow = true;
  scene.add(skirtMesh);

  // Placa de fundo inferior da maquete
  const basePlateGeo = new THREE.PlaneGeometry(geoW, geoH);
  basePlateGeo.rotateX(Math.PI / 2);
  const basePlateMesh = new THREE.Mesh(basePlateGeo, skirtMat);
  basePlateMesh.position.y = yBase;
  basePlateMesh.receiveShadow = true;
  scene.add(basePlateMesh);
}

function updateSkirtElevation() {
  if (!skirtMesh || !skirtGeometry || !rawSkirtEdgeMap.length) return;
  const demW = state.demDimensions.width;
  const demH = state.demDimensions.height;
  const posAttr = skirtGeometry.attributes.position;

  for (let i = 0; i < rawSkirtEdgeMap.length; i++) {
    const item = rawSkirtEdgeMap[i];
    const elev = getBilinearElevation(item.u, item.v, demW, demH) * state.baseHeight * state.exaggeration;
    posAttr.setY(item.idx, elev);
  }
  posAttr.needsUpdate = true;
  skirtGeometry.computeVertexNormals();
}

// ====================================================================
// Gerador de Modelos 3D Sólidos Procedurais (Botânica & Arquitetura)
// Escala 1:1 Métrica Real (1 metro = 0.00404 Three.js units) com Cores por Vértice
// ====================================================================

function createColoredGeometry(parts) {
  const nonIndexedParts = parts.map(p => {
    const g = p.geo || p.geom;
    const non = g.toNonIndexed ? g.toNonIndexed() : g;
    const count = non.attributes.position.count;
    const cols = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      cols[i * 3] = p.color[0];
      cols[i * 3 + 1] = p.color[1];
      cols[i * 3 + 2] = p.color[2];
    }
    non.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return non;
  });

  if (window.THREE && THREE.BufferGeometryUtils && THREE.BufferGeometryUtils.mergeBufferGeometries) {
    const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(nonIndexedParts, false);
    if (merged) {
      merged.computeVertexNormals();
      return merged;
    }
  }
  return nonIndexedParts[0];
}

// 1. Árvore da Mata Tropical / Floresta Estacional & Galeria (ID 3)
function createTropicalTree3DGeo() {
  const trunk = new THREE.CylinderGeometry(0.0035, 0.0055, 0.038, 5);
  trunk.translate(0, 0.019, 0);

  const lobe1 = new THREE.DodecahedronGeometry(0.024, 0);
  lobe1.scale(1.2, 0.75, 1.1);
  lobe1.translate(0, 0.046, 0);

  const lobe2 = new THREE.DodecahedronGeometry(0.020, 0);
  lobe2.scale(1.0, 0.75, 1.0);
  lobe2.translate(0.003, 0.060, -0.002);

  const lobe3 = new THREE.DodecahedronGeometry(0.015, 0);
  lobe3.scale(0.9, 0.8, 0.9);
  lobe3.translate(-0.002, 0.072, 0.002);

  return createColoredGeometry([
    { geo: trunk, color: [0.26, 0.17, 0.11] },
    { geo: lobe1, color: [0.11, 0.36, 0.18] },
    { geo: lobe2, color: [0.15, 0.48, 0.23] },
    { geo: lobe3, color: [0.22, 0.58, 0.28] }
  ]);
}

// 2. Árvore do Cerrado Típico (ID 4 - Formação Savânica)
function createCerradoTree3DGeo() {
  const trunkLower = new THREE.CylinderGeometry(0.003, 0.0045, 0.015, 5);
  trunkLower.rotateZ(0.12);
  trunkLower.translate(0.001, 0.0075, 0);

  const trunkUpper = new THREE.CylinderGeometry(0.002, 0.003, 0.014, 5);
  trunkUpper.rotateZ(-0.22);
  trunkUpper.rotateX(0.15);
  trunkUpper.translate(-0.002, 0.019, 0.001);

  const crown1 = new THREE.DodecahedronGeometry(0.015, 0);
  crown1.scale(1.3, 0.55, 1.1);
  crown1.translate(0.004, 0.026, 0.002);

  const crown2 = new THREE.DodecahedronGeometry(0.012, 0);
  crown2.scale(1.1, 0.50, 1.0);
  crown2.translate(-0.006, 0.029, -0.003);

  return createColoredGeometry([
    { geo: trunkLower, color: [0.36, 0.26, 0.18] },
    { geo: trunkUpper, color: [0.32, 0.23, 0.15] },
    { geo: crown1,     color: [0.30, 0.50, 0.20] },
    { geo: crown2,     color: [0.38, 0.58, 0.25] }
  ]);
}

// 3. Arbusto Denso do Cerrado (ID 4)
function createCerradoShrub3DGeo() {
  const mound1 = new THREE.DodecahedronGeometry(0.009, 0);
  mound1.scale(1.3, 0.7, 1.2);
  mound1.translate(0, 0.006, 0);

  const mound2 = new THREE.DodecahedronGeometry(0.007, 0);
  mound2.scale(1.0, 0.65, 1.0);
  mound2.translate(0.003, 0.011, -0.002);

  return createColoredGeometry([
    { geo: mound1, color: [0.28, 0.46, 0.18] },
    { geo: mound2, color: [0.36, 0.56, 0.24] }
  ]);
}

// 4. Silvicultura / Eucalipto (ID 9)
function createEucalyptus3DGeo() {
  const trunk = new THREE.CylinderGeometry(0.002, 0.003, 0.080, 5);
  trunk.translate(0, 0.040, 0);

  const crown = new THREE.ConeGeometry(0.011, 0.050, 6);
  crown.translate(0, 0.095, 0);

  return createColoredGeometry([
    { geo: trunk, color: [0.75, 0.74, 0.70] },
    { geo: crown, color: [0.18, 0.38, 0.24] }
  ]);
}

// 5. Afloramento Rochoso e Campo Rupestre (ID 29)
function createQuartziteRock3DGeo() {
  const rock1 = new THREE.DodecahedronGeometry(0.015, 0);
  rock1.scale(1.4, 0.8, 1.1);
  rock1.rotateX(0.3);
  rock1.rotateZ(0.25);
  rock1.translate(0, 0.011, 0);

  const rock2 = new THREE.BoxGeometry(0.014, 0.012, 0.016);
  rock2.rotateY(0.7);
  rock2.rotateZ(-0.35);
  rock2.translate(0.007, 0.009, -0.005);

  const plant = new THREE.ConeGeometry(0.004, 0.009, 5);
  plant.translate(-0.009, 0.018, 0.004);

  return createColoredGeometry([
    { geo: rock1, color: [0.68, 0.54, 0.42] },
    { geo: rock2, color: [0.58, 0.48, 0.38] },
    { geo: plant, color: [0.28, 0.44, 0.20] }
  ]);
}

// 6. Pastagem / Capim Braquiária 3D Sólido (ID 15 & 21)
// Módulo leve low-poly com base abaulada e lâminas cônicas (14 polígonos)
function create3DPastureTuftGeo() {
  const mound = new THREE.CylinderGeometry(0.007, 0.018, 0.005, 6);
  mound.translate(0, 0.0025, 0);

  const blade1 = new THREE.ConeGeometry(0.007, 0.012, 4);
  blade1.rotateZ(0.14);
  blade1.translate(0.002, 0.0075, 0.001);

  const blade2 = new THREE.ConeGeometry(0.005, 0.009, 4);
  blade2.rotateZ(-0.16);
  blade2.translate(-0.003, 0.0065, -0.002);

  return createColoredGeometry([
    { geo: mound,  color: [0.32, 0.52, 0.18] }, // Base verde densa
    { geo: blade1, color: [0.42, 0.64, 0.24] }, // Ponta iluminada
    { geo: blade2, color: [0.36, 0.58, 0.20] }  // Sombra natural
  ]);
}

// 7. Campo Nativo / Formação Campestre (ID 12)
function createGrasslandNative3DGeo() {
  const base = new THREE.DodecahedronGeometry(0.009, 0);
  base.scale(1.1, 0.5, 1.1);
  base.translate(0, 0.0035, 0);

  const plume = new THREE.ConeGeometry(0.005, 0.014, 5);
  plume.translate(0, 0.011, 0);

  return createColoredGeometry([
    { geo: base,  color: [0.38, 0.48, 0.20] },
    { geo: plume, color: [0.72, 0.66, 0.40] }
  ]);
}

// 8. Soja (ID 39 - Formação Agrícola 3.2.1.1)
// Módulos de fileiras de cultivo contínuas e densas sobre solo preparado (sulcos de semeadura)
function createSoybeanCrop3DGeo() {
  const rowBase = new THREE.BoxGeometry(0.026, 0.002, 0.011);
  rowBase.translate(0, 0.001, 0);

  const bush1 = new THREE.DodecahedronGeometry(0.0068, 0);
  bush1.scale(1.4, 0.8, 1.15);
  bush1.translate(-0.0065, 0.004, 0);

  const bush2 = new THREE.DodecahedronGeometry(0.0072, 0);
  bush2.scale(1.45, 0.85, 1.15);
  bush2.translate(0.0065, 0.004, 0);

  return createColoredGeometry([
    { geo: rowBase, color: [0.34, 0.24, 0.16] }, // Solo agrícola preparado / sulco de plantio
    { geo: bush1,   color: [0.28, 0.52, 0.15] }, // Folhagem de soja viçosa
    { geo: bush2,   color: [0.36, 0.60, 0.19] }  // Folhagem iluminada pelo sol
  ]);
}

// 9. Outras Lavouras Temporárias / Milho e Grãos (ID 41 - 3.2.1.5)
// Colmos e talhões agrícolas com pendão amarelo (altura real ~1.8m)
function createTemporaryCrop3DGeo() {
  const stalk1 = new THREE.CylinderGeometry(0.001, 0.0015, 0.014, 4);
  stalk1.translate(-0.004, 0.007, 0);

  const stalk2 = new THREE.CylinderGeometry(0.001, 0.0015, 0.016, 4);
  stalk2.translate(0.004, 0.008, 0);

  const leaves = new THREE.ConeGeometry(0.007, 0.012, 5);
  leaves.translate(0, 0.011, 0);

  const tassel = new THREE.ConeGeometry(0.003, 0.007, 4);
  tassel.translate(0.002, 0.018, 0);

  return createColoredGeometry([
    { geo: stalk1, color: [0.36, 0.52, 0.18] },
    { geo: stalk2, color: [0.38, 0.56, 0.20] },
    { geo: leaves, color: [0.42, 0.62, 0.22] },
    { geo: tassel, color: [0.78, 0.66, 0.25] } // Pendão dourado
  ]);
}

// 10. Palmeira Buriti das Veredas Pantanosas (ID 11 - Mauritia flexuosa)
// Estipe alto esguio (~14m real) e copa circular em leque com vegetação paludosa
function createBuritiPalm3DGeo() {
  const trunk = new THREE.CylinderGeometry(0.0025, 0.0038, 0.052, 5);
  trunk.translate(0, 0.026, 0);

  const crown1 = new THREE.DodecahedronGeometry(0.016, 0);
  crown1.scale(1.3, 0.55, 1.3);
  crown1.translate(0, 0.054, 0);

  const crown2 = new THREE.ConeGeometry(0.014, 0.012, 6);
  crown2.rotateX(Math.PI);
  crown2.translate(0, 0.057, 0);

  const wetlandSedge = new THREE.ConeGeometry(0.008, 0.008, 5);
  wetlandSedge.translate(0, 0.004, 0);

  return createColoredGeometry([
    { geo: trunk,        color: [0.38, 0.32, 0.25] }, // Estipe cinza-castanho
    { geo: crown1,       color: [0.18, 0.44, 0.16] }, // Frondes em leque
    { geo: crown2,       color: [0.25, 0.55, 0.20] }, // Folhas superiores
    { geo: wetlandSedge, color: [0.20, 0.45, 0.30] }  // Vegetação paludosa basal
  ]);
}

// 11. Solo Exposto & Não Vegetado (ID 25 - Terras Vermelhas / Cascalheiras)
// Módulos facetados baixos de solo laterítico e cascalho
function createBareGround3DGeo() {
  const mound = new THREE.DodecahedronGeometry(0.008, 0);
  mound.scale(1.6, 0.35, 1.5);
  mound.translate(0, 0.003, 0);

  const gravel1 = new THREE.BoxGeometry(0.006, 0.004, 0.006);
  gravel1.rotateY(0.4);
  gravel1.translate(-0.003, 0.003, 0.002);

  const gravel2 = new THREE.DodecahedronGeometry(0.004, 0);
  gravel2.translate(0.004, 0.003, -0.002);

  return createColoredGeometry([
    { geo: mound,   color: [0.72, 0.36, 0.22] }, // Solo laterítico vermelho-terracota
    { geo: gravel1, color: [0.55, 0.28, 0.18] }, // Cascalho ferroso escuro
    { geo: gravel2, color: [0.82, 0.54, 0.36] }  // Solo seco claro
  ]);
}

// 12. Corpos Hídricos / Rio e Margem Ripária (ID 33)
// Pedras de leito polidas pela água e juncos ripários
function createRiverBank3DGeo() {
  const stone1 = new THREE.DodecahedronGeometry(0.008, 0);
  stone1.scale(1.5, 0.45, 1.1);
  stone1.translate(0, 0.003, 0);

  const stone2 = new THREE.DodecahedronGeometry(0.006, 0);
  stone2.scale(1.2, 0.40, 1.3);
  stone2.translate(0.005, 0.003, -0.003);

  const reed = new THREE.ConeGeometry(0.003, 0.012, 4);
  reed.translate(-0.005, 0.007, 0.003);

  return createColoredGeometry([
    { geo: stone1, color: [0.28, 0.35, 0.42] }, // Rocha úmida ardósia/seixo
    { geo: stone2, color: [0.35, 0.42, 0.48] }, // Seixo fluvial polido
    { geo: reed,   color: [0.18, 0.48, 0.32] }  // Junco ripário / taboa
  ]);
}

// 1. Casa Térrea Colonial Goiana Autêntica (Típica de Goiás Velho)
// Embasamento de pedra (soco de cantaria), paredes caiadas/coloridas, portas e janelas com molduras, beiral largo e telhado de duas águas em telha de barro cerâmica com cumeeira
function createDetailedColonialHouseGeo(colorStyle = 0) {
  // Soco / embasamento de cantaria de pedra na linha de terra
  const plinth = new THREE.BoxGeometry(0.040, 0.003, 0.034);
  plinth.translate(0, 0.0015, 0);

  // Paredes principais de adobe/alvenaria colonial
  const walls = new THREE.BoxGeometry(0.038, 0.016, 0.032);
  walls.translate(0, 0.0095, 0);

  // Porta colonial alta de madeira nobre
  const door = new THREE.BoxGeometry(0.0065, 0.0125, 0.0012);
  door.translate(0, 0.0075, 0.0161);

  // Verga / bandeira da porta
  const doorFrame = new THREE.BoxGeometry(0.008, 0.002, 0.0015);
  doorFrame.translate(0, 0.0142, 0.0161);

  // Duas janelas coloniais de madeira com molduras almofadadas
  const winL = new THREE.BoxGeometry(0.006, 0.0075, 0.0012);
  winL.translate(-0.011, 0.010, 0.0161);

  const winR = new THREE.BoxGeometry(0.006, 0.0075, 0.0012);
  winR.translate(0.011, 0.010, 0.0161);

  // Beiral de madeira saliente (cimalha colonial)
  const eaves = new THREE.BoxGeometry(0.043, 0.0016, 0.036);
  eaves.translate(0, 0.0175, 0);

  // Telhado Colonial de Duas Águas com Telhas Cerâmicas e Cumeeira
  const roofPitchFront = new THREE.BoxGeometry(0.043, 0.002, 0.021);
  roofPitchFront.rotateX(0.40);
  roofPitchFront.translate(0, 0.0215, 0.0095);

  const roofPitchBack = new THREE.BoxGeometry(0.043, 0.002, 0.021);
  roofPitchBack.rotateX(-0.40);
  roofPitchBack.translate(0, 0.0215, -0.0095);

  const ridgeCap = new THREE.CylinderGeometry(0.0015, 0.0015, 0.044, 4);
  ridgeCap.rotateZ(Math.PI / 2);
  ridgeCap.translate(0, 0.0260, 0);

  // Paletas de cores coloniais autênticas de Goiás Velho:
  let wallColor = [0.95, 0.95, 0.93]; // Branco caiado
  let frameColor = [0.15, 0.38, 0.62]; // Azul colonial clássico
  if (colorStyle === 1) {
    wallColor = [0.86, 0.62, 0.24];  // Ocre dourado colonial
    frameColor = [0.96, 0.96, 0.96]; // Branco
  } else if (colorStyle === 2) {
    wallColor = [0.95, 0.95, 0.93];  // Branco
    frameColor = [0.18, 0.44, 0.26]; // Verde garrafa colonial
  } else if (colorStyle === 3) {
    wallColor = [0.76, 0.38, 0.32];  // Terracota / Rosa seco colonial
    frameColor = [0.96, 0.96, 0.96]; // Branco
  }

  const stoneColor = [0.46, 0.44, 0.40];      // Cantaria de pedra
  const darkWood = [0.22, 0.14, 0.08];        // Madeira nobre
  const tileColor = [0.74, 0.28, 0.14];       // Telha cerâmica terracota
  const ridgeColor = [0.65, 0.22, 0.10];      // Cumeeira escurecida

  return createColoredGeometry([
    { geo: plinth,         color: stoneColor },
    { geo: walls,          color: wallColor },
    { geo: door,           color: darkWood },
    { geo: doorFrame,      color: frameColor },
    { geo: winL,           color: frameColor },
    { geo: winR,           color: frameColor },
    { geo: eaves,          color: darkWood },
    { geo: roofPitchFront, color: tileColor },
    { geo: roofPitchBack,  color: tileColor },
    { geo: ridgeCap,       color: ridgeColor }
  ]);
}

// 2. Sobrado Histórico Colonial de 2 Pavimentos com Sacadas de Ferro Forjado
// Embasamento de pedra, portas comerciais no térreo, friso divisor, portas-janelas com sacadas trabalhadas no piso superior e telhado de 4 águas
function createDetailedColonialSobradoGeo(colorStyle = 0) {
  const plinth = new THREE.BoxGeometry(0.046, 0.0035, 0.040);
  plinth.translate(0, 0.00175, 0);

  // Pavimento Térreo
  const groundFloor = new THREE.BoxGeometry(0.044, 0.016, 0.038);
  groundFloor.translate(0, 0.0095, 0);

  // 3 Portas coloniais altas no térreo
  const door1 = new THREE.BoxGeometry(0.006, 0.013, 0.0012);
  door1.translate(-0.013, 0.008, 0.0191);
  const door2 = new THREE.BoxGeometry(0.006, 0.013, 0.0012);
  door2.translate(0, 0.008, 0.0191);
  const door3 = new THREE.BoxGeometry(0.006, 0.013, 0.0012);
  door3.translate(0.013, 0.008, 0.0191);

  // Friso / Cinta de cantaria divisória entre pavimentos
  const stringCourse = new THREE.BoxGeometry(0.0455, 0.002, 0.0395);
  stringCourse.translate(0, 0.0185, 0);

  // Segundo Pavimento
  const upperFloor = new THREE.BoxGeometry(0.044, 0.016, 0.038);
  upperFloor.translate(0, 0.0265, 0);

  // 3 Portas-janelas coloniais altas
  const upperWin1 = new THREE.BoxGeometry(0.0055, 0.011, 0.0012);
  upperWin1.translate(-0.013, 0.026, 0.0191);
  const upperWin2 = new THREE.BoxGeometry(0.0055, 0.011, 0.0012);
  upperWin2.translate(0, 0.026, 0.0191);
  const upperWin3 = new THREE.BoxGeometry(0.0055, 0.011, 0.0012);
  upperWin3.translate(0.013, 0.026, 0.0191);

  // Sacada Corrida com Balcão de Cantaria e Gradil de Ferro Forjado
  const balconySlab = new THREE.BoxGeometry(0.036, 0.0018, 0.006);
  balconySlab.translate(0, 0.019, 0.022);

  const balconyRailing = new THREE.BoxGeometry(0.036, 0.0065, 0.0012);
  balconyRailing.translate(0, 0.023, 0.025);

  // Beiral largo de madeira trabalhada
  const eaves = new THREE.BoxGeometry(0.048, 0.0022, 0.042);
  eaves.translate(0, 0.035, 0);

  // Telhado Colonial de Quatro Águas
  const roof = new THREE.ConeGeometry(0.034, 0.013, 4);
  roof.rotateY(Math.PI / 4);
  roof.translate(0, 0.0415, 0);

  const wallColor = (colorStyle === 1) ? [0.86, 0.64, 0.26] : [0.94, 0.94, 0.92];
  const frameColor = (colorStyle === 1) ? [0.96, 0.96, 0.96] : [0.18, 0.36, 0.58];

  return createColoredGeometry([
    { geo: plinth,         color: [0.44, 0.42, 0.38] },
    { geo: groundFloor,    color: wallColor },
    { geo: door1,          color: [0.22, 0.14, 0.08] },
    { geo: door2,          color: [0.22, 0.14, 0.08] },
    { geo: door3,          color: [0.22, 0.14, 0.08] },
    { geo: stringCourse,   color: [0.38, 0.36, 0.32] },
    { geo: upperFloor,     color: wallColor },
    { geo: upperWin1,      color: frameColor },
    { geo: upperWin2,      color: frameColor },
    { geo: upperWin3,      color: frameColor },
    { geo: balconySlab,    color: [0.44, 0.42, 0.38] },
    { geo: balconyRailing, color: [0.12, 0.12, 0.12] }, // Ferro forjado preto
    { geo: eaves,          color: [0.26, 0.16, 0.10] },
    { geo: roof,           color: [0.70, 0.24, 0.11] }  // Telha cerâmica
  ]);
}

// 3. Igreja / Matriz Barroca Colonial Goiana (Inspirada na Igreja de Sant'Ana / São Francisco de Goiás Velho)
// Monumental adro de pedra com cruzeiro, frontispício barroco detalhado, duas torres sineiras com sinos dourados visíveis e cruz central
function createDetailedColonialChurchGeo() {
  // Grande Adro com Escadaria de Pedra de Quartzito
  const churchyard = new THREE.BoxGeometry(0.080, 0.004, 0.105);
  churchyard.translate(0, 0.002, 0.008);

  // Grande Cruzeiro de Pedra no Adro da Igreja
  const crossPlinth = new THREE.BoxGeometry(0.008, 0.006, 0.008);
  crossPlinth.translate(0, 0.007, 0.042);
  const crossShaft = new THREE.BoxGeometry(0.0016, 0.020, 0.0016);
  crossShaft.translate(0, 0.020, 0.042);
  const crossArm = new THREE.BoxGeometry(0.010, 0.0016, 0.0016);
  crossArm.translate(0, 0.024, 0.042);

  // Nave Principal da Igreja
  const nave = new THREE.BoxGeometry(0.046, 0.034, 0.070);
  nave.translate(0, 0.019, -0.012);

  // Telhado Colonial da Nave
  const naveRoof = new THREE.BoxGeometry(0.050, 0.0025, 0.072);
  naveRoof.translate(0, 0.0365, -0.012);

  // Frontispício Barroco Curvilíneo
  const pediment = new THREE.BoxGeometry(0.028, 0.012, 0.003);
  pediment.translate(0, 0.040, 0.023);

  // Cruz Monumental no Cume do Frontão
  const pedimentCrossShaft = new THREE.BoxGeometry(0.0012, 0.010, 0.0012);
  pedimentCrossShaft.translate(0, 0.050, 0.023);
  const pedimentCrossArm = new THREE.BoxGeometry(0.006, 0.0012, 0.0012);
  pedimentCrossArm.translate(0, 0.052, 0.023);

  // Grande Portal Barroco com Verga em Arco de Madeira Nobre
  const portal = new THREE.BoxGeometry(0.012, 0.018, 0.002);
  portal.translate(0, 0.011, 0.024);

  // Janelões Altos do Coro
  const choirWinL = new THREE.BoxGeometry(0.006, 0.010, 0.0015);
  choirWinL.translate(-0.010, 0.026, 0.024);
  const choirWinR = new THREE.BoxGeometry(0.006, 0.010, 0.0015);
  choirWinR.translate(0.010, 0.026, 0.024);

  // Óculo Barroco Circular
  const oculus = new THREE.CylinderGeometry(0.0035, 0.0035, 0.002, 8);
  oculus.rotateX(Math.PI / 2);
  oculus.translate(0, 0.031, 0.024);

  // DUAS TORRES SINEIRAS MONUMENTAIS (Esquerda e Direita)
  const towerL = new THREE.BoxGeometry(0.016, 0.056, 0.016);
  towerL.translate(-0.022, 0.028, 0.018);

  const towerR = new THREE.BoxGeometry(0.016, 0.056, 0.016);
  towerR.translate(0.022, 0.028, 0.018);

  // Vãos Vazados das Sineiras (Aberturas em arco escurecidas)
  const belfryArchL = new THREE.BoxGeometry(0.008, 0.011, 0.002);
  belfryArchL.translate(-0.022, 0.046, 0.0261);

  const belfryArchR = new THREE.BoxGeometry(0.008, 0.011, 0.002);
  belfryArchR.translate(0.022, 0.046, 0.0261);

  // Sinos de Bronze Dourado nas Sineiras
  const bellL = new THREE.CylinderGeometry(0.0016, 0.0030, 0.0045, 6);
  bellL.translate(-0.022, 0.046, 0.024);

  const bellR = new THREE.CylinderGeometry(0.0016, 0.0030, 0.0045, 6);
  bellR.translate(0.022, 0.046, 0.024);

  // Cúpulas / Coruchéus das Torres em Telha Cerâmica / Azul Barroco
  const spireL = new THREE.ConeGeometry(0.013, 0.016, 4);
  spireL.rotateY(Math.PI / 4);
  spireL.translate(-0.022, 0.064, 0.018);

  const spireR = new THREE.ConeGeometry(0.013, 0.016, 4);
  spireR.rotateY(Math.PI / 4);
  spireR.translate(0.022, 0.064, 0.018);

  return createColoredGeometry([
    { geo: churchyard,         color: [0.52, 0.50, 0.46] }, // Pedra de quartzito
    { geo: crossPlinth,        color: [0.46, 0.44, 0.40] },
    { geo: crossShaft,         color: [0.38, 0.36, 0.32] },
    { geo: crossArm,           color: [0.38, 0.36, 0.32] },
    { geo: nave,               color: [0.96, 0.96, 0.95] }, // Branco caiado monumental
    { geo: naveRoof,           color: [0.72, 0.25, 0.12] }, // Telha de barro
    { geo: pediment,           color: [0.96, 0.96, 0.95] },
    { geo: pedimentCrossShaft, color: [0.85, 0.72, 0.22] }, // Cruz dourada
    { geo: pedimentCrossArm,   color: [0.85, 0.72, 0.22] },
    { geo: portal,             color: [0.24, 0.14, 0.08] }, // Madeira nobre
    { geo: choirWinL,          color: [0.18, 0.36, 0.58] }, // Moldura azul barroca
    { geo: choirWinR,          color: [0.18, 0.36, 0.58] },
    { geo: oculus,             color: [0.22, 0.38, 0.58] },
    { geo: towerL,             color: [0.96, 0.96, 0.95] },
    { geo: towerR,             color: [0.96, 0.96, 0.95] },
    { geo: belfryArchL,        color: [0.12, 0.12, 0.14] },
    { geo: belfryArchR,        color: [0.12, 0.12, 0.14] },
    { geo: bellL,              color: [0.86, 0.70, 0.24] }, // Bronze dourado
    { geo: bellR,              color: [0.86, 0.70, 0.24] },
    { geo: spireL,             color: [0.18, 0.36, 0.56] }, // Cúpula azul colonial
    { geo: spireR,             color: [0.18, 0.36, 0.56] }
  ]);
}

// 4. Lampião Colonial de Ferro Forjado Goiano
function createColonialLanternGeo() {
  const base = new THREE.CylinderGeometry(0.0016, 0.0022, 0.003, 5);
  base.translate(0, 0.0015, 0);

  const post = new THREE.CylinderGeometry(0.0007, 0.0009, 0.018, 4);
  post.translate(0, 0.011, 0);

  const arm = new THREE.BoxGeometry(0.0035, 0.001, 0.001);
  arm.translate(0.0015, 0.0195, 0);

  const lantern = new THREE.ConeGeometry(0.0022, 0.004, 4);
  lantern.rotateX(Math.PI);
  lantern.translate(0.003, 0.018, 0);

  return createColoredGeometry([
    { geo: base,    color: [0.14, 0.14, 0.14] }, // Ferro fundido
    { geo: post,    color: [0.14, 0.14, 0.14] },
    { geo: arm,     color: [0.14, 0.14, 0.14] },
    { geo: lantern, color: [0.98, 0.76, 0.22] }  // Vidro com luz quente âmbar
  ]);
}

// 5. Árvores dos Quintais e Praças Coloniais de Goiás Velho (Verdes Frondosas, Pomares Densos, Ipês Amarelos e Rosas)
function createColonialYardTreeGeo(treeType = 'green') {
  const trunk = new THREE.CylinderGeometry(0.0022, 0.0038, 0.022, 5);
  trunk.translate(0, 0.011, 0);

  const branch1 = new THREE.CylinderGeometry(0.0012, 0.0018, 0.010, 4);
  branch1.rotateZ(0.35);
  branch1.translate(0.003, 0.018, 0);

  const canopy1 = new THREE.DodecahedronGeometry(0.016, 0);
  canopy1.scale(1.25, 0.85, 1.25);
  canopy1.translate(0, 0.025, 0);

  const canopy2 = new THREE.DodecahedronGeometry(0.011, 0);
  canopy2.translate(0.005, 0.032, -0.003);

  let c1, c2;
  if (treeType === 'deep_green') {
    // Verde profundo / Pomar fechado (Mangueira, Oitizeiro, Jabuticabeira)
    c1 = [0.12, 0.40, 0.16];
    c2 = [0.16, 0.48, 0.20];
  } else if (treeType === 'yellow') {
    // Ipê Amarelo florido tradicional
    c1 = [0.96, 0.78, 0.12];
    c2 = [0.98, 0.84, 0.18];
  } else if (treeType === 'pink') {
    // Ipê Rosa florido tradicional
    c1 = [0.88, 0.38, 0.62];
    c2 = [0.94, 0.48, 0.70];
  } else {
    // Verde Vivo tradicional / Árvore de sombra frondosa dos quintais goianos
    c1 = [0.22, 0.54, 0.22];
    c2 = [0.28, 0.62, 0.26];
  }

  return createColoredGeometry([
    { geo: trunk,   color: [0.32, 0.24, 0.17] },
    { geo: branch1, color: [0.32, 0.24, 0.17] },
    { geo: canopy1, color: c1 },
    { geo: canopy2, color: c2 }
  ]);
}

// 6. Gado Bovino Nelore Realista com Cupim Proeminente, Barbela, Chifres e Pelagem
function createNeloreCowGeo(variant = 'nelore') {
  // Tronco volumoso e robusto
  const body = new THREE.BoxGeometry(0.026, 0.014, 0.013);
  body.translate(0, 0.014, 0);

  // Cupim (Giba) Zebuína proeminente sobre a cernelha
  const hump = new THREE.DodecahedronGeometry(0.005, 0);
  hump.scale(1.25, 1.55, 1.05);
  hump.translate(-0.007, 0.0235, 0);

  // Barbela pendente flexuosa sob o peito
  const dewlap = new THREE.ConeGeometry(0.0038, 0.0085, 4);
  dewlap.scale(1.0, 1.0, 0.5);
  dewlap.translate(-0.014, 0.009, 0);

  // Pescoço
  const neck = new THREE.BoxGeometry(0.009, 0.010, 0.009);
  neck.rotateZ(-0.35);
  neck.translate(-0.013, 0.016, 0);

  // Cabeça com chanfro alongado
  const head = new THREE.BoxGeometry(0.010, 0.0075, 0.0075);
  head.translate(-0.0185, 0.014, 0);

  // Focinho escuro
  const muzzle = new THREE.BoxGeometry(0.004, 0.005, 0.0065);
  muzzle.translate(-0.023, 0.012, 0);

  // Chifres elegantes voltados para cima e trás
  const hornL = new THREE.ConeGeometry(0.0014, 0.006, 3);
  hornL.rotateX(0.40);
  hornL.rotateZ(-0.30);
  hornL.translate(-0.017, 0.0195, 0.004);

  const hornR = new THREE.ConeGeometry(0.0014, 0.006, 3);
  hornR.rotateX(-0.40);
  hornR.rotateZ(-0.30);
  hornR.translate(-0.017, 0.0195, -0.004);

  // Orelhas caídas
  const earL = new THREE.ConeGeometry(0.002, 0.0065, 3);
  earL.rotateX(0.60);
  earL.translate(-0.015, 0.0155, 0.0065);

  const earR = new THREE.ConeGeometry(0.002, 0.0065, 3);
  earR.rotateX(-0.60);
  earR.translate(-0.015, 0.0155, -0.0065);

  // 4 Membros com articulações e cascos escuros
  const legFL = new THREE.CylinderGeometry(0.0022, 0.0018, 0.012, 4);
  legFL.translate(-0.008, 0.006, 0.0045);

  const legFR = new THREE.CylinderGeometry(0.0022, 0.0018, 0.012, 4);
  legFR.translate(-0.008, 0.006, -0.0045);

  const legBL = new THREE.CylinderGeometry(0.0025, 0.0018, 0.012, 4);
  legBL.translate(0.008, 0.006, 0.0045);

  const legBR = new THREE.CylinderGeometry(0.0025, 0.0018, 0.012, 4);
  legBR.translate(0.008, 0.006, -0.0045);

  // Cascos pretos
  const hoofFL = new THREE.CylinderGeometry(0.0024, 0.0024, 0.002, 4);
  hoofFL.translate(-0.008, 0.001, 0.0045);
  const hoofFR = new THREE.CylinderGeometry(0.0024, 0.0024, 0.002, 4);
  hoofFR.translate(-0.008, 0.001, -0.0045);
  const hoofBL = new THREE.CylinderGeometry(0.0024, 0.0024, 0.002, 4);
  hoofBL.translate(0.008, 0.001, 0.0045);
  const hoofBR = new THREE.CylinderGeometry(0.0024, 0.0024, 0.002, 4);
  hoofBR.translate(0.008, 0.001, -0.0045);

  // Cauda com tufo
  const tail = new THREE.CylinderGeometry(0.0008, 0.0008, 0.012, 3);
  tail.rotateZ(0.25);
  tail.translate(0.014, 0.010, 0);

  let bodyColor = [0.95, 0.95, 0.93]; // Nelore branco clássico
  let humpColor = [0.90, 0.90, 0.88];
  if (variant === 'spotted') {
    bodyColor = [0.18, 0.18, 0.18]; // Malhada P&B
    humpColor = [0.92, 0.92, 0.92];
  } else if (variant === 'brown') {
    bodyColor = [0.62, 0.32, 0.16]; // Girolando castanho
    humpColor = [0.52, 0.26, 0.12];
  }

  return createColoredGeometry([
    { geo: body,    color: bodyColor },
    { geo: hump,    color: humpColor },
    { geo: dewlap,  color: bodyColor },
    { geo: neck,    color: bodyColor },
    { geo: head,    color: bodyColor },
    { geo: muzzle,  color: [0.18, 0.18, 0.18] }, // Focinho preto
    { geo: hornL,   color: [0.88, 0.85, 0.72] }, // Chifre marfim
    { geo: hornR,   color: [0.88, 0.85, 0.72] },
    { geo: earL,    color: bodyColor },
    { geo: earR,    color: bodyColor },
    { geo: legFL,   color: bodyColor },
    { geo: legFR,   color: bodyColor },
    { geo: legBL,   color: bodyColor },
    { geo: legBR,   color: bodyColor },
    { geo: hoofFL,  color: [0.16, 0.16, 0.16] }, // Cascos escuros
    { geo: hoofFR,  color: [0.16, 0.16, 0.16] },
    { geo: hoofBL,  color: [0.16, 0.16, 0.16] },
    { geo: hoofBR,  color: [0.16, 0.16, 0.16] },
    { geo: tail,    color: [0.22, 0.20, 0.20] }
  ]);
}

// 7. Cavalo de Lida / Manga-larga Marchador (Porte nobre, pescoço arqueado, crina e cauda)
function createHorseGeo() {
  const body = new THREE.BoxGeometry(0.026, 0.013, 0.010);
  body.translate(0, 0.016, 0);

  const neck = new THREE.BoxGeometry(0.007, 0.015, 0.006);
  neck.rotateZ(-0.62);
  neck.translate(-0.012, 0.021, 0);

  const head = new THREE.BoxGeometry(0.009, 0.0065, 0.0055);
  head.rotateZ(0.20);
  head.translate(-0.018, 0.025, 0);

  const earL = new THREE.ConeGeometry(0.0012, 0.004, 3);
  earL.translate(-0.017, 0.029, 0.0018);
  const earR = new THREE.ConeGeometry(0.0012, 0.004, 3);
  earR.translate(-0.017, 0.029, -0.0018);

  const mane = new THREE.BoxGeometry(0.003, 0.013, 0.002);
  mane.rotateZ(-0.62);
  mane.translate(-0.010, 0.023, 0);

  // 4 Patas esguias
  const legFL = new THREE.CylinderGeometry(0.0016, 0.0013, 0.015, 4);
  legFL.translate(-0.008, 0.0075, 0.0035);
  const legFR = new THREE.CylinderGeometry(0.0016, 0.0013, 0.015, 4);
  legFR.translate(-0.008, 0.0075, -0.0035);
  const legBL = new THREE.CylinderGeometry(0.0018, 0.0014, 0.015, 4);
  legBL.translate(0.008, 0.0075, 0.0035);
  const legBR = new THREE.CylinderGeometry(0.0018, 0.0014, 0.015, 4);
  legBR.translate(0.008, 0.0075, -0.0035);

  const tail = new THREE.ConeGeometry(0.0026, 0.016, 4);
  tail.rotateZ(0.35);
  tail.translate(0.014, 0.013, 0);

  const coatColor = [0.52, 0.26, 0.12]; // Castanho alazão
  const maneColor = [0.12, 0.10, 0.08]; // Crina preta

  return createColoredGeometry([
    { geo: body,  color: coatColor },
    { geo: neck,  color: coatColor },
    { geo: head,  color: coatColor },
    { geo: earL,  color: coatColor },
    { geo: earR,  color: coatColor },
    { geo: mane,  color: maneColor },
    { geo: legFL, color: coatColor },
    { geo: legFR, color: coatColor },
    { geo: legBL, color: coatColor },
    { geo: legBR, color: coatColor },
    { geo: tail,  color: maneColor }
  ]);
}

// 8. Trator Agrícola Moderno (John Deere verde ou Case vermelho com rodas gigantes e implemento)
function createTractorGeo(isGreen = true) {
  const hood = new THREE.BoxGeometry(0.020, 0.012, 0.012);
  hood.translate(-0.008, 0.011, 0);

  const cabin = new THREE.BoxGeometry(0.015, 0.015, 0.014);
  cabin.translate(0.007, 0.020, 0);

  const cabRoof = new THREE.BoxGeometry(0.017, 0.0028, 0.016);
  cabRoof.translate(0.007, 0.028, 0);

  const exhaust = new THREE.CylinderGeometry(0.0009, 0.0009, 0.016, 4);
  exhaust.translate(-0.001, 0.023, 0.0055);

  // Rodas Traseiras Gigantes com Garras
  const wheelRL = new THREE.CylinderGeometry(0.009, 0.009, 0.005, 8);
  wheelRL.rotateX(Math.PI / 2);
  wheelRL.translate(0.008, 0.009, 0.009);

  const wheelRR = new THREE.CylinderGeometry(0.009, 0.009, 0.005, 8);
  wheelRR.rotateX(Math.PI / 2);
  wheelRR.translate(0.008, 0.009, -0.009);

  // Rodas Dianteiras Direcionais
  const wheelFL = new THREE.CylinderGeometry(0.006, 0.006, 0.0035, 6);
  wheelFL.rotateX(Math.PI / 2);
  wheelFL.translate(-0.014, 0.006, 0.0075);

  const wheelFR = new THREE.CylinderGeometry(0.006, 0.006, 0.0035, 6);
  wheelFR.rotateX(Math.PI / 2);
  wheelFR.translate(-0.014, 0.006, -0.0075);

  // Implemento Acoplado Traseiro (Grade Aradora / Plantadeira)
  const implement = new THREE.BoxGeometry(0.016, 0.004, 0.022);
  implement.translate(0.020, 0.005, 0);

  const bodyColor = isGreen ? [0.16, 0.54, 0.20] : [0.82, 0.18, 0.15];
  const roofColor = isGreen ? [0.92, 0.84, 0.16] : [0.96, 0.96, 0.96];

  return createColoredGeometry([
    { geo: hood,      color: bodyColor },
    { geo: cabin,     color: [0.20, 0.32, 0.40] }, // Vidro fumê
    { geo: cabRoof,   color: roofColor },
    { geo: exhaust,   color: [0.16, 0.16, 0.16] },
    { geo: wheelRL,   color: [0.16, 0.16, 0.16] },
    { geo: wheelRR,   color: [0.16, 0.16, 0.16] },
    { geo: wheelFL,   color: [0.16, 0.16, 0.16] },
    { geo: wheelFR,   color: [0.16, 0.16, 0.16] },
    { geo: implement, color: [0.28, 0.28, 0.28] }
  ]);
}

// 9. Colheitadeira de Grãos de Alta Capacidade com Plataforma Draper
function createHarvesterGeo() {
  const body = new THREE.BoxGeometry(0.036, 0.020, 0.020);
  body.translate(0, 0.019, 0);

  const cab = new THREE.BoxGeometry(0.013, 0.013, 0.016);
  cab.translate(-0.013, 0.027, 0);

  const cabRoof = new THREE.BoxGeometry(0.015, 0.0025, 0.018);
  cabRoof.translate(-0.013, 0.034, 0);

  // Plataforma Frontal Larga de Corte Draper (Corte de grãos)
  const draper = new THREE.BoxGeometry(0.008, 0.005, 0.060);
  draper.translate(-0.024, 0.005, 0);

  const reel = new THREE.CylinderGeometry(0.003, 0.003, 0.058, 6);
  reel.rotateX(Math.PI / 2);
  reel.translate(-0.024, 0.009, 0);

  // Tubo de Descarga Basculante (Auger)
  const auger = new THREE.CylinderGeometry(0.0016, 0.0016, 0.032, 4);
  auger.rotateZ(-0.35);
  auger.rotateY(0.40);
  auger.translate(0.006, 0.030, 0.015);

  const wheelFL = new THREE.CylinderGeometry(0.010, 0.010, 0.006, 8);
  wheelFL.rotateX(Math.PI / 2);
  wheelFL.translate(-0.007, 0.010, 0.012);

  const wheelFR = new THREE.CylinderGeometry(0.010, 0.010, 0.006, 8);
  wheelFR.rotateX(Math.PI / 2);
  wheelFR.translate(-0.007, 0.010, -0.012);

  const wheelRL = new THREE.CylinderGeometry(0.007, 0.007, 0.004, 6);
  wheelRL.rotateX(Math.PI / 2);
  wheelRL.translate(0.013, 0.007, 0.010);

  const wheelRR = new THREE.CylinderGeometry(0.007, 0.007, 0.004, 6);
  wheelRR.rotateX(Math.PI / 2);
  wheelRR.translate(0.013, 0.007, -0.010);

  return createColoredGeometry([
    { geo: body,    color: [0.82, 0.18, 0.15] }, // Vermelho Case
    { geo: cab,     color: [0.20, 0.32, 0.40] },
    { geo: cabRoof, color: [0.96, 0.96, 0.96] },
    { geo: draper,  color: [0.26, 0.26, 0.26] },
    { geo: reel,    color: [0.86, 0.78, 0.18] }, // Molinete dourado
    { geo: auger,   color: [0.82, 0.18, 0.15] },
    { geo: wheelFL, color: [0.16, 0.16, 0.16] },
    { geo: wheelFR, color: [0.16, 0.16, 0.16] },
    { geo: wheelRL, color: [0.16, 0.16, 0.16] },
    { geo: wheelRR, color: [0.16, 0.16, 0.16] }
  ]);
}

// Criador de Instância Contínua com Coordenadas Sub-Pixel Livres (Sem vínculo com centro de pixel)
function createContinuousItem(xCol, yRow, demW, demH, geoW, geoH, scaleBase, rnd, fixedRot, tiltX = 0, tiltZ = 0, offsetY = 0) {
  const u = Math.max(0, Math.min(1, xCol / (demW - 1)));
  const v = Math.max(0, Math.min(1, yRow / (demH - 1)));
  const x = (u - 0.5) * geoW;
  const z = (v - 0.5) * geoH;
  const elev = getBilinearElevation(u, v, demW, demH);
  const rotY = (fixedRot !== undefined) ? fixedRot : rnd * Math.PI * 2;
  const scaleMult = scaleBase * (0.85 + rnd * 0.30); // Variação botânica e estrutural natural

  return {
    x, z, elev, rotY,
    tiltX, tiltZ,
    offsetY,
    scaleX: scaleMult,
    scaleY: scaleMult,
    scaleZ: scaleMult
  };
}

// 8. Build All Brazilian Biome Props with Free Continuous Sub-Pixel Scattering

// --- Modelos Arquitetônicos Modernistas de Brasília (Plano Piloto) ---

// 1. Bloco Residencial de Superquadra de Brasília (Lúcio Costa / Niemeyer)
// Edifício de 6 pavimentos sobre pilotis livres no térreo, janelas horizontais e cobogós
function createBrasiliaSuperquadraGeo(colorStyle = 0) {
  // Pilotis (colunas cilíndricas livres no piso térreo)
  const pilotisGeos = [];
  const colRadius = 0.0016;
  const colHeight = 0.007;
  const colZ = [-0.012, 0.0, 0.012];
  const colX = [-0.038, -0.019, 0, 0.019, 0.038];

  for (const cx of colX) {
    for (const cz of colZ) {
      const col = new THREE.CylinderGeometry(colRadius, colRadius, colHeight, 6);
      col.translate(cx, colHeight / 2, cz);
      pilotisGeos.push(col);
    }
  }
  const mergedPilotis = THREE.BufferGeometryUtils.mergeBufferGeometries(pilotisGeos);

  // Laje de piso do 1º andar
  const slab1 = new THREE.BoxGeometry(0.084, 0.0012, 0.030);
  slab1.translate(0, colHeight, 0);

  // Corpo principal do edifício residencial (5 pavimentos superiores)
  const bodyHeight = 0.024;
  const body = new THREE.BoxGeometry(0.082, bodyHeight, 0.028);
  body.translate(0, colHeight + bodyHeight / 2, 0);

  // Faixas horizontais de esquadrias e janelas contínuas (Ribbon Windows modernistas)
  const winBands = [];
  for (let floor = 0; floor < 5; floor++) {
    const fy = colHeight + 0.0025 + floor * 0.0048;
    const bandFront = new THREE.BoxGeometry(0.078, 0.0022, 0.0015);
    bandFront.translate(0, fy, 0.0142);
    const bandBack = new THREE.BoxGeometry(0.078, 0.0022, 0.0015);
    bandBack.translate(0, fy, -0.0142);
    winBands.push(bandFront, bandBack);
  }
  const mergedWins = THREE.BufferGeometryUtils.mergeBufferGeometries(winBands);

  // Platibanda e terraço superior
  const roofSlab = new THREE.BoxGeometry(0.084, 0.0015, 0.030);
  roofSlab.translate(0, colHeight + bodyHeight + 0.0007, 0);

  // Caixa d'água / volume técnico modernista no teto
  const roofBox = new THREE.BoxGeometry(0.022, 0.004, 0.016);
  roofBox.translate(-0.015, colHeight + bodyHeight + 0.0035, 0);

  // Cores modernistas de Brasília
  let concreteColor = [0.92, 0.92, 0.90]; // Concreto claro / off-white
  if (colorStyle === 1) concreteColor = [0.86, 0.85, 0.82]; // Concreto aparente cinza
  else if (colorStyle === 2) concreteColor = [0.95, 0.95, 0.94]; // Branco alvorada
  else if (colorStyle === 3) concreteColor = [0.90, 0.88, 0.83]; // Travertino/bege

  const pilotisColor = [0.35, 0.35, 0.35]; // Pilares de concreto escuro
  const glassColor = [0.15, 0.28, 0.38];   // Esquadrias e vidros escurecidos

  return createColoredGeometry([
    { geo: mergedPilotis, color: pilotisColor },
    { geo: slab1,        color: concreteColor },
    { geo: body,         color: concreteColor },
    { geo: mergedWins,   color: glassColor },
    { geo: roofSlab,     color: concreteColor },
    { geo: roofBox,      color: pilotisColor }
  ]);
}

// 2. Bloco Ministerial da Esplanada dos Ministérios (Niemeyer)
// Empenas cegas laterais de mármore branco com cortina de vidro verde e esquadrias de alumínio
function createBrasiliaMinistryGeo() {
  // Embasamento
  const base = new THREE.BoxGeometry(0.060, 0.003, 0.036);
  base.translate(0, 0.0015, 0);

  // Fachada frontal e traseira de pele de vidro
  const glassBody = new THREE.BoxGeometry(0.056, 0.032, 0.032);
  glassBody.translate(0, 0.019, 0);

  // Empena lateral esquerda cega (Mármore branco)
  const sideWallL = new THREE.BoxGeometry(0.0025, 0.035, 0.034);
  sideWallL.translate(-0.029, 0.019, 0);

  // Empena lateral direita cega (Mármore branco)
  const sideWallR = new THREE.BoxGeometry(0.0025, 0.035, 0.034);
  sideWallR.translate(0.029, 0.019, 0);

  // Cobertura plana com terraço
  const roof = new THREE.BoxGeometry(0.060, 0.002, 0.036);
  roof.translate(0, 0.037, 0);

  return createColoredGeometry([
    { geo: base,      color: [0.30, 0.30, 0.32] },
    { geo: glassBody, color: [0.18, 0.38, 0.35] }, // Vidro esverdeado típico dos Ministérios
    { geo: sideWallL, color: [0.96, 0.96, 0.96] }, // Mármore branco
    { geo: sideWallR, color: [0.96, 0.96, 0.96] }, // Mármore branco
    { geo: roof,      color: [0.85, 0.85, 0.85] }
  ]);
}

// 3. Congresso Nacional (As duas cúpulas e torres gêmeas icônicas de Oscar Niemeyer)
// 3. Congresso Nacional (Torres Gêmeas de 100m + Cúpulas da Câmara e Senado)
function createBrasiliaCongressGeo() {
  const parts = [];

  // Embasamento / Plinth horizontal (Mármore branco)
  // Largura Norte-Sul: 0.65, Profundidade Leste-Oeste: 0.26, Altura: 0.035
  const plinth = new THREE.BoxGeometry(0.26, 0.035, 0.65);
  plinth.translate(0, 0.0175, 0);
  parts.push({ geom: plinth, color: [0.94, 0.95, 0.97] });

  // Torres Gêmeas do Anexo I (100 metros / 28 andares)
  const towerW = 0.040;
  const towerH = 0.35;
  const towerD = 0.11;
  const gap = 0.022;

  // Torre Norte
  const towerN = new THREE.BoxGeometry(towerW, towerH, towerD);
  towerN.translate(0.01, towerH / 2 + 0.035, -gap / 2 - towerD / 2);
  parts.push({ geom: towerN, color: [0.96, 0.97, 0.99] });

  // Torre Sul
  const towerS = new THREE.BoxGeometry(towerW, towerH, towerD);
  towerS.translate(0.01, towerH / 2 + 0.035, gap / 2 + towerD / 2);
  parts.push({ geom: towerS, color: [0.96, 0.97, 0.99] });

  // Passarela / Ponte envidraçada entre as torres
  const bridge = new THREE.BoxGeometry(towerW * 0.95, 0.030, gap);
  bridge.translate(0.01, towerH * 0.62 + 0.035, 0);
  parts.push({ geom: bridge, color: [0.22, 0.25, 0.30] });

  // Cúpula da Câmara dos Deputados (Voltada para cima / Prato côncavo)
  // Localizada na ala SUL (+Z)
  const cupolaCamara = new THREE.CylinderGeometry(0.09, 0.025, 0.045, 20);
  cupolaCamara.translate(-0.02, 0.035 + 0.022, 0.20);
  parts.push({ geom: cupolaCamara, color: [0.98, 0.98, 1.0] });

  // Cúpula do Senado Federal (Voltada para baixo / Semiesfera convexa)
  // Localizada na ala NORTE (-Z)
  const cupolaSenado = new THREE.SphereGeometry(0.075, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  cupolaSenado.translate(-0.02, 0.035, -0.20);
  parts.push({ geom: cupolaSenado, color: [0.98, 0.98, 1.0] });

  // Rampa cerimonial de acesso de pedestres pela Esplanada (Oeste)
  const ramp = new THREE.BoxGeometry(0.14, 0.008, 0.040);
  ramp.rotateZ(0.18);
  ramp.translate(-0.18, 0.016, 0);
  parts.push({ geom: ramp, color: [0.92, 0.93, 0.95] });

  // Espelho d'água frontal
  const pool = new THREE.BoxGeometry(0.10, 0.005, 0.55);
  pool.translate(-0.16, 0.003, 0);
  parts.push({ geom: pool, color: [0.15, 0.45, 0.65] });

  return createColoredGeometry(parts);
}


// ============================================================================
// --- MODELOS ARQUITETÔNICOS MONUMENTAIS DE BRASÍLIA (OPENSTREETMAP 3D) ---
// ============================================================================

// Função auxiliar para criar cilindros orientados no espaço 3D usando quaternions (BufferGeometry pura)
function createOrientedCylinder(p1, p2, radiusTop, radiusBottom, segments = 6) {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, len, segments);
  geo.translate(0, len / 2, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
  const mat4 = new THREE.Matrix4().makeRotationFromQuaternion(quat);
  geo.applyMatrix4(mat4);
  geo.translate(p1.x, p1.y, p1.z);
  return geo;
}

// 1. Catedral Metropolitana Nossa Senhora Aparecida (Oscar Niemeyer)
function createBrasiliaCathedralGeo() {
  const parts = [];
  const numPillars = 16;
  const radiusBase = 0.14;
  const radiusWaist = 0.055;
  const radiusTop = 0.12;
  const heightWaist = 0.08;
  const heightTop = 0.16;

  for (let i = 0; i < numPillars; i++) {
    const angle = (i / numPillars) * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    const p1 = new THREE.Vector3(cosA * radiusBase, 0.005, sinA * radiusBase);
    const p2 = new THREE.Vector3(cosA * radiusWaist, heightWaist, sinA * radiusWaist);
    const colLower = createOrientedCylinder(p1, p2, 0.005, 0.007, 6);

    const p3 = new THREE.Vector3(cosA * radiusTop, heightTop, sinA * radiusTop);
    const colUpper = createOrientedCylinder(p2, p3, 0.004, 0.005, 6);

    parts.push({ geom: colLower, color: [0.95, 0.96, 0.98] });
    parts.push({ geom: colUpper, color: [0.97, 0.98, 0.99] });
  }

  const glassNave = new THREE.ConeGeometry(radiusWaist * 0.95, heightWaist * 0.90, 16);
  glassNave.translate(0, heightWaist * 0.45, 0);
  parts.push({ geom: glassNave, color: [0.20, 0.58, 0.88] }); // Vitrais azuis Marianne Peretti

  const waterRing = new THREE.CylinderGeometry(radiusBase * 1.22, radiusBase * 1.22, 0.005, 24);
  parts.push({ geom: waterRing, color: [0.15, 0.42, 0.62] });

  const bellTower = new THREE.BoxGeometry(0.015, 0.10, 0.015);
  bellTower.translate(-0.19, 0.05, 0.05);
  parts.push({ geom: bellTower, color: [0.92, 0.94, 0.96] });

  return createColoredGeometry(parts);
}

// 2. Ponte Juscelino Kubitschek (Ponte JK - Alexandre Chan)
function createPonteJKGeo() {
  const parts = [];
  const deckLength = 2.15;
  const deckWidth = 0.08;

  const deck = new THREE.BoxGeometry(deckWidth, 0.012, deckLength);
  deck.translate(0, 0.035, 0);
  parts.push({ geom: deck, color: [0.26, 0.28, 0.32] });

  const railL = new THREE.BoxGeometry(0.004, 0.012, deckLength);
  railL.translate(-deckWidth / 2, 0.042, 0);
  const railR = new THREE.BoxGeometry(0.004, 0.012, deckLength);
  railR.translate(deckWidth / 2, 0.042, 0);
  parts.push({ geom: railL, color: [0.94, 0.95, 0.97] });
  parts.push({ geom: railR, color: [0.94, 0.95, 0.97] });

  const archOffsetsZ = [-0.60, 0.0, 0.60];
  const archSkews = [0.06, -0.06, 0.06];

  for (let a = 0; a < 3; a++) {
    const centerZ = archOffsetsZ[a];
    const skew = archSkews[a];
    const spanZ = 0.60;
    const numSteps = 14;

    for (let s = 0; s < numSteps; s++) {
      const t1 = s / numSteps;
      const t2 = (s + 1) / numSteps;

      const y1 = 0.035 + Math.sin(t1 * Math.PI) * 0.20;
      const y2 = 0.035 + Math.sin(t2 * Math.PI) * 0.20;

      const x1 = (t1 - 0.5) * skew * 2.0;
      const x2 = (t2 - 0.5) * skew * 2.0;

      const z1 = centerZ + (t1 - 0.5) * spanZ;
      const z2 = centerZ + (t2 - 0.5) * spanZ;

      const pStart = new THREE.Vector3(x1, y1, z1);
      const pEnd = new THREE.Vector3(x2, y2, z2);

      const archSeg = createOrientedCylinder(pStart, pEnd, 0.008, 0.008, 6);
      parts.push({ geom: archSeg, color: [0.96, 0.97, 0.99] });
    }
  }

  for (let p = -2; p <= 2; p++) {
    const pier = new THREE.BoxGeometry(0.10, 0.06, 0.03);
    pier.translate(0, 0.01, p * 0.48);
    parts.push({ geom: pier, color: [0.65, 0.68, 0.72] });
  }

  return createColoredGeometry(parts);
}

// 3. Torre de TV de Brasília (Lúcio Costa - 224m)
function createBrasiliaTVTowerGeo() {
  const parts = [];
  const legH = 0.26;

  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2;
    const pBase = new THREE.Vector3(Math.cos(ang) * 0.12, 0, Math.sin(ang) * 0.12);
    const pTop = new THREE.Vector3(Math.cos(ang) * 0.035, legH, Math.sin(ang) * 0.035);
    const leg = createOrientedCylinder(pBase, pTop, 0.012, 0.018, 5);
    parts.push({ geom: leg, color: [0.72, 0.52, 0.22] });
  }

  // Mezanino / Mirante hexagonal
  const deck = new THREE.CylinderGeometry(0.085, 0.065, 0.022, 6);
  deck.translate(0, legH + 0.011, 0);
  parts.push({ geom: deck, color: [0.88, 0.90, 0.92] });

  const glassHall = new THREE.CylinderGeometry(0.060, 0.060, 0.018, 6);
  glassHall.translate(0, legH + 0.025, 0);
  parts.push({ geom: glassHall, color: [0.25, 0.45, 0.60] });

  // Mastro e Antena de transmissão (topo a 224m reais)
  const mast = new THREE.CylinderGeometry(0.005, 0.014, 0.48, 6);
  mast.translate(0, legH + 0.035 + 0.24, 0);
  parts.push({ geom: mast, color: [0.92, 0.94, 0.96] });

  // Sinalizador aéreo
  const beacon = new THREE.SphereGeometry(0.010, 8, 6);
  beacon.translate(0, legH + 0.035 + 0.48, 0);
  parts.push({ geom: beacon, color: [0.96, 0.18, 0.12] });

  return createColoredGeometry(parts);
}

// 4. Arena BRB Mané Garrincha (Ícaro de Castro Mello - 310m de diâmetro)
function createManeGarrinchaGeo() {
  const parts = [];
  const radius = 0.42;
  const numCols = 36;
  const colH = 0.14;

  for (let i = 0; i < numCols; i++) {
    const ang = (i / numCols) * Math.PI * 2;
    const px = Math.cos(ang) * radius;
    const pz = Math.sin(ang) * radius;
    const col = new THREE.CylinderGeometry(0.008, 0.008, colH, 6);
    col.translate(px, colH / 2, pz);
    parts.push({ geom: col, color: [0.92, 0.93, 0.95] });
  }

  // Anel de cobertura externa
  const roof = new THREE.CylinderGeometry(radius * 1.05, radius * 1.05, 0.016, 36);
  roof.translate(0, colH + 0.008, 0);
  parts.push({ geom: roof, color: [0.95, 0.96, 0.98] });

  // Bacia de arquibancada (vermelha)
  const bowl = new THREE.CylinderGeometry(radius * 0.92, radius * 0.50, colH * 0.85, 32);
  bowl.translate(0, colH * 0.42, 0);
  parts.push({ geom: bowl, color: [0.75, 0.20, 0.18] });

  // Campo de futebol gramado
  const pitch = new THREE.BoxGeometry(0.24, 0.008, 0.15);
  pitch.translate(0, 0.004, 0);
  parts.push({ geom: pitch, color: [0.15, 0.65, 0.25] });

  return createColoredGeometry(parts);
}

// 5. Memorial JK (Oscar Niemeyer)
function createMemorialJKGeo() {
  const parts = [];
  const base = new THREE.BoxGeometry(0.18, 0.024, 0.09);
  base.translate(0, 0.012, 0);
  parts.push({ geom: base, color: [0.26, 0.28, 0.32] });

  // Lâmina de concreto curva (28m)
  const blade = new THREE.BoxGeometry(0.016, 0.11, 0.016);
  blade.translate(0, 0.024 + 0.055, 0);
  parts.push({ geom: blade, color: [0.95, 0.96, 0.98] });

  // Nicho
  const niche = new THREE.BoxGeometry(0.024, 0.022, 0.018);
  niche.translate(0, 0.024 + 0.10, 0);
  parts.push({ geom: niche, color: [0.95, 0.96, 0.98] });

  // Estátua de JK
  const statue = new THREE.BoxGeometry(0.008, 0.016, 0.008);
  statue.translate(0, 0.024 + 0.10, 0);
  parts.push({ geom: statue, color: [0.18, 0.18, 0.20] });

  return createColoredGeometry(parts);
}

// 6. Palácio do Planalto & Palácio do STF (Oscar Niemeyer)
function createPalacioPlanaltoGeo() {
  const parts = [];
  const w = 0.26, h = 0.070, d = 0.14;

  const roof = new THREE.BoxGeometry(w, 0.008, d);
  roof.translate(0, h, 0);
  const floor = new THREE.BoxGeometry(w, 0.009, d);
  floor.translate(0, 0.004, 0);
  parts.push({ geom: roof, color: [0.96, 0.97, 0.99] });
  parts.push({ geom: floor, color: [0.90, 0.92, 0.94] });

  const glass = new THREE.BoxGeometry(w * 0.92, h - 0.008, d * 0.88);
  glass.translate(0, h / 2, 0);
  parts.push({ geom: glass, color: [0.25, 0.50, 0.68] });

  for (let c = -4; c <= 4; c++) {
    const colX = c * (w * 0.44 / 4);
    const colF = new THREE.BoxGeometry(0.007, h, 0.014);
    colF.translate(colX, h / 2, d / 2 + 0.005);
    const colB = new THREE.BoxGeometry(0.007, h, 0.014);
    colB.translate(colX, h / 2, -d / 2 - 0.005);
    parts.push({ geom: colF, color: [0.96, 0.97, 0.99] });
    parts.push({ geom: colB, color: [0.96, 0.97, 0.99] });
  }

  const ramp = new THREE.BoxGeometry(0.024, 0.006, 0.10);
  ramp.rotateX(0.24);
  ramp.translate(0, 0.018, d / 2 + 0.045);
  parts.push({ geom: ramp, color: [0.92, 0.94, 0.96] });

  return createColoredGeometry(parts);
}

// 7. Palácio da Alvorada (Oscar Niemeyer)
function createPalacioAlvoradaGeo() {
  const parts = [];
  const w = 0.28, h = 0.065, d = 0.14;

  const roof = new THREE.BoxGeometry(w, 0.008, d);
  roof.translate(0, h, 0);
  const floor = new THREE.BoxGeometry(w, 0.008, d);
  floor.translate(0, 0.004, 0);
  parts.push({ geom: roof, color: [0.96, 0.97, 0.98] });
  parts.push({ geom: floor, color: [0.92, 0.93, 0.95] });

  const glass = new THREE.BoxGeometry(w * 0.90, h - 0.008, d * 0.85);
  glass.translate(0, h / 2, 0);
  parts.push({ geom: glass, color: [0.20, 0.46, 0.62] });

  for (let c = -4; c <= 4; c++) {
    const colZ = c * (w * 0.42 / 4);
    const colFront = new THREE.BoxGeometry(0.008, h, 0.015);
    colFront.translate(colZ, h / 2, d / 2 + 0.005);
    parts.push({ geom: colFront, color: [0.97, 0.98, 0.99] });
  }

  const pool = new THREE.BoxGeometry(w * 1.15, 0.005, d * 0.70);
  pool.translate(0, 0.002, d * 0.85);
  parts.push({ geom: pool, color: [0.12, 0.40, 0.58] });

  return createColoredGeometry(parts);
}

// ============================================================================
// --- GERENCIADOR DE RODOVIAS & REDE VIÁRIA (OPENSTREETMAP) ---
// ============================================================================
let roadsGroup = null;
let roadsLineMesh = null;
let rawRoadsVertices = [];
let roadsLoaded = false;

// Limites Territoriais Oficiais do Distrito Federal (IBGE)
let dfBoundaryGroup = null;
let rawBoundaryVertices = [];

// Pedestal / Saia da Maquete 3D Arquitetônica
let skirtMesh = null;
let skirtGeometry = null;
let rawSkirtEdgeMap = [];

async function loadRoadsNetwork() {
  try {
    const resp = await fetch('public/roads.json');
    if (!resp.ok) return;
    const data = await resp.json();
    buildRoadsMesh(data);
    roadsLoaded = true;
    console.log('🛣️ Rede viária OSM carregada com sucesso.');
  } catch (err) {
    console.warn('Erro ao carregar rede viária OSM:', err);
  }
}

function buildRoadsMesh(data) {
  if (roadsGroup) {
    scene.remove(roadsGroup);
    roadsGroup.clear();
  }
  roadsGroup = new THREE.Group();
  window.roadsGroup = roadsGroup;
  scene.add(roadsGroup);

  const demW = state.demDimensions.width;
  const demH = state.demDimensions.height;

  const positions = [];
  const colors = [];
  rawRoadsVertices = [];

  const tierColors = {
    tier1: new THREE.Color(0x0a0a0a), // Preto Ônix Profundo / Rodovias Expressas, Eixos e EPTG/Estrutural
    tier2: new THREE.Color(0x27272a), // Grafite Escuro Intenso / Avenidas Principais e Vias Arteriais
    tier3: new THREE.Color(0x475569)  // Cinza Ardósia / Vias Locais, Setores e Malha Urbana Secundária
  };

  const tiers = ['tier1', 'tier2', 'tier3'];
  for (const t of tiers) {
    const list = data[t] || [];
    const col = tierColors[t];

    for (let i = 0; i < list.length; i++) {
      const road = list[i];
      const pts = road.pts;
      if (!pts || pts.length < 2) continue;

      for (let j = 0; j < pts.length - 1; j++) {
        const p1 = pts[j];
        const p2 = pts[j + 1];

        const elev1 = getBilinearElevation(p1[2], p1[3], demW, demH) * state.baseHeight * state.exaggeration + 0.048;
        const elev2 = getBilinearElevation(p2[2], p2[3], demW, demH) * state.baseHeight * state.exaggeration + 0.048;

        positions.push(p1[0], elev1, p1[1]);
        colors.push(col.r, col.g, col.b);
        rawRoadsVertices.push({ u: p1[2], v: p1[3] });

        positions.push(p2[0], elev2, p2[1]);
        colors.push(col.r, col.g, col.b);
        rawRoadsVertices.push({ u: p2[2], v: p2[3] });
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 1.0,
    depthWrite: false
  });

  roadsLineMesh = new THREE.LineSegments(geom, mat);
  roadsLineMesh.visible = (state.roads && state.roads.enabled !== undefined) ? state.roads.enabled : true;
  roadsGroup.add(roadsLineMesh);
}

function updateRoadsElevation() {
  if (!roadsLineMesh || !rawRoadsVertices.length) return;
  const posAttr = roadsLineMesh.geometry.attributes.position;
  const demW = state.demDimensions.width;
  const demH = state.demDimensions.height;

  for (let i = 0; i < rawRoadsVertices.length; i++) {
    const v = rawRoadsVertices[i];
    const elev = getBilinearElevation(v.u, v.v, demW, demH) * state.baseHeight * state.exaggeration + 0.048;
    posAttr.setY(i, elev);
  }
  posAttr.needsUpdate = true;
}
// ============================================================================
// --- GERENCIADOR DE LIMITES OFICIAIS DO DISTRITO FEDERAL (IBGE) ---
// ============================================================================
async function loadDFBoundary() {
  try {
    const resp = await fetch('public/df_boundary.json');
    if (!resp.ok) return;
    const data = await resp.json();
    buildDFBoundaryMesh(data);
    console.log('🗺️ Limites oficiais do DF (IBGE) carregados com sucesso.');
  } catch (err) {
    console.warn('Erro ao carregar limites do DF:', err);
  }
}

function buildDFBoundaryMesh(data) {
  if (dfBoundaryGroup) {
    scene.remove(dfBoundaryGroup);
    dfBoundaryGroup.clear();
  }
  dfBoundaryGroup = new THREE.Group();
  window.dfBoundaryGroup = dfBoundaryGroup;
  scene.add(dfBoundaryGroup);
  rawBoundaryVertices = [];

  const demW = state.demDimensions.width;
  const demH = state.demDimensions.height;
  const ribbonH = 0.55; // Altura da fita luminosa arquitetônica destacada

  // Material da fita vertical em Vermelho Carmesim (Crimson Red)
  const ribbonMat = new THREE.MeshBasicMaterial({
    color: 0xdc143c, // Vermelho Carmesim clássico (Crimson)
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  // Linha superior de cumeada em carmesim elétrico iluminado
  const lineMat = new THREE.LineBasicMaterial({
    color: 0xff2a55, // Carmesim luminoso vibrante
    linewidth: 2,
    transparent: true,
    opacity: 0.98
  });

  const rings = data.rings || [];
  for (const ring of rings) {
    if (!ring || ring.length < 2) continue;

    const quadPositions = [];
    const linePositions = [];
    const ringVerts = [];

    const N = ring.length;
    for (let i = 0; i < N; i++) {
      const p1 = ring[i];
      const p2 = ring[(i + 1) % N];

      const e1 = getBilinearElevation(p1[2], p1[3], demW, demH) * state.baseHeight * state.exaggeration;
      const e2 = getBilinearElevation(p2[2], p2[3], demW, demH) * state.baseHeight * state.exaggeration;

      const yBot1 = e1 + 0.04;
      const yTop1 = e1 + ribbonH;
      const yBot2 = e2 + 0.04;
      const yTop2 = e2 + ribbonH;

      // Triângulo 1: bot1 -> bot2 -> top2
      quadPositions.push(p1[0], yBot1, p1[1]);
      quadPositions.push(p2[0], yBot2, p2[1]);
      quadPositions.push(p2[0], yTop2, p2[1]);

      // Triângulo 2: bot1 -> top2 -> top1
      quadPositions.push(p1[0], yBot1, p1[1]);
      quadPositions.push(p2[0], yTop2, p2[1]);
      quadPositions.push(p1[0], yTop1, p1[1]);

      // Top line
      linePositions.push(p1[0], yTop1, p1[1]);

      // Store UVs for dynamic update
      ringVerts.push({
        u1: p1[2], v1: p1[3],
        u2: p2[2], v2: p2[3],
        quadStart: i * 18,
        lineIdx: i
      });
    }

    const ribbonGeo = new THREE.BufferGeometry();
    ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(quadPositions, 3));
    const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
    dfBoundaryGroup.add(ribbonMesh);

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const lineMesh = new THREE.LineLoop(lineGeo, lineMat);
    dfBoundaryGroup.add(lineMesh);

    rawBoundaryVertices.push({ ribbonMesh, lineMesh, ringVerts, ribbonH });
  }

  const chk = document.getElementById('check-df-boundary');
  dfBoundaryGroup.visible = !chk || chk.checked;
}

function updateDFBoundaryElevation() {
  if (!rawBoundaryVertices.length) return;
  const demW = state.demDimensions.width;
  const demH = state.demDimensions.height;

  for (const item of rawBoundaryVertices) {
    const qPos = item.ribbonMesh.geometry.attributes.position;
    const lPos = item.lineMesh.geometry.attributes.position;
    const h = item.ribbonH;

    for (const v of item.ringVerts) {
      const e1 = getBilinearElevation(v.u1, v.v1, demW, demH) * state.baseHeight * state.exaggeration;
      const e2 = getBilinearElevation(v.u2, v.v2, demW, demH) * state.baseHeight * state.exaggeration;

      const yBot1 = e1 + 0.04;
      const yTop1 = e1 + h;
      const yBot2 = e2 + 0.04;
      const yTop2 = e2 + h;

      const q = v.quadStart;
      // tri 1: bot1, bot2, top2
      qPos.setY(q / 3 + 0, yBot1);
      qPos.setY(q / 3 + 1, yBot2);
      qPos.setY(q / 3 + 2, yTop2);

      // tri 2: bot1, top2, top1
      qPos.setY(q / 3 + 3, yBot1);
      qPos.setY(q / 3 + 4, yTop2);
      qPos.setY(q / 3 + 5, yTop1);

      // line
      lPos.setY(v.lineIdx, yTop1);
    }

    qPos.needsUpdate = true;
    lPos.needsUpdate = true;
  }
}


// ============================================================================
// --- GERENCIADOR DE MARCOS ARQUITETÔNICOS (OPENSTREETMAP 3D) ---
// ============================================================================
let osmLandmarksGroup = null;
let osmLandmarksData = [];

async function loadOSMLandmarks() {
  try {
    const resp = await fetch('public/osm_landmarks_3d.json');
    if (!resp.ok) return;
    const data = await resp.json();
    osmLandmarksData = data.landmarks || [];
    buildOSMLandmarks(data);
    console.log('🏛️ Modelos 3D de marcos de Brasília carregados com sucesso.');
  } catch (err) {
    console.warn('Erro ao carregar marcos 3D OSM:', err);
  }
}

function buildOSMLandmarks(data) {
  if (osmLandmarksGroup) {
    scene.remove(osmLandmarksGroup);
    osmLandmarksGroup.clear();
  }
  osmLandmarksGroup = new THREE.Group();
  window.osmLandmarksGroup = osmLandmarksGroup;
  scene.add(osmLandmarksGroup);

  const demW = state.demDimensions.width;
  const demH = state.demDimensions.height;

  const landmarkGeos = {
    congresso: createBrasiliaCongressGeo(),
    catedral: createBrasiliaCathedralGeo(),
    ponte_jk: createPonteJKGeo(),
    torre_tv: createBrasiliaTVTowerGeo(),
    estadio_garrincha: createManeGarrinchaGeo(),
    memorial_jk: createMemorialJKGeo(),
    palacio_planalto: createPalacioPlanaltoGeo(),
    stf: createPalacioPlanaltoGeo(),
    palacio_alvorada: createPalacioAlvoradaGeo()
  };

  const pbrMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.65,
    metalness: 0.12,
    flatShading: true
  });

  const list = data.landmarks || [];
  const s = state.landmarks ? (state.landmarks.scale || 1.0) : 1.0;

  for (const lm of list) {
    const geo = landmarkGeos[lm.id];
    if (!geo) continue;

    const mesh = new THREE.Mesh(geo, pbrMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    if (lm.id === 'congresso') {
      // Rotacionado 20º no sentido horário a partir da orientação base
      mesh.rotation.y = 0.1112 - THREE.MathUtils.degToRad(20);
    } else if (lm.id === 'ponte_jk') {
      // Rotacionado 18º no sentido horário para alinhamento com a travessia real do Lago Paranoá
      mesh.rotation.y = 0.88 - THREE.MathUtils.degToRad(18);
    } else if (lm.id === 'palacio_planalto') {
      // Rotacionado 10º no sentido horário
      mesh.rotation.y = -0.06 - THREE.MathUtils.degToRad(10);
    } else if (lm.id === 'stf') {
      // Rotacionado 10º no sentido horário
      mesh.rotation.y = (Math.PI - 0.06) - THREE.MathUtils.degToRad(10);
    } else if (lm.id === 'palacio_alvorada') {
      mesh.rotation.y = -0.45;
    }

    mesh.scale.set(s, s, s);

    const elev = getBilinearElevation(lm.u, lm.v, demW, demH) * state.baseHeight * state.exaggeration;
    mesh.position.set(lm.scene_x, elev, lm.scene_z);
    mesh.userData = lm;
    osmLandmarksGroup.add(mesh);
  }

  osmLandmarksGroup.visible = state.landmarks ? (state.landmarks.enabled !== false) : true;
}

function updateLandmarksScale(scaleVal) {
  if (!state.landmarks) state.landmarks = {};
  state.landmarks.scale = scaleVal;
  if (!osmLandmarksGroup) return;
  osmLandmarksGroup.traverse(child => {
    if (child.isMesh && child.userData && child.userData.id) {
      child.scale.set(scaleVal, scaleVal, scaleVal);
    }
  });
}

function updateOSMLandmarksElevation() {
  if (!osmLandmarksGroup) return;
  const demW = state.demDimensions.width;
  const demH = state.demDimensions.height;

  osmLandmarksGroup.traverse(child => {
    if (child.isMesh && child.userData && child.userData.u !== undefined) {
      const u = child.userData.u;
      const v = child.userData.v;
      const elev = getBilinearElevation(u, v, demW, demH) * state.baseHeight * state.exaggeration;
      child.position.y = elev;
    }
  });
}


function buildPropsMeshes() {
  if (!rawClasses || !rawElevations) return;

  if (propsGroup) {
    scene.remove(propsGroup);
    propsGroup.traverse(child => {
      if (child.isInstancedMesh && child.geometry) {
        child.geometry.dispose();
      }
    });
  }
  propsGroup = new THREE.Group();
  scene.add(propsGroup);

  // Clear previous layers
  for (const k of Object.keys(propLayers)) {
    delete propLayers[k];
  }

  const density = state.props.density || 1.0;
  const dSqrt = Math.sqrt(density);

  const demW = state.demDimensions.width; // 3738
  const demH = state.demDimensions.height; // 2294
  const geoW = state.terrainSpan.width; // 200
  const geoH = state.terrainSpan.height; // 122.74

  const forestItems = [];
  const cerradoTreeItems = [];
  const cerradoShrubItems = [];
  const rocksItems = [];
  const pastureItems = [];
  const silvicultureItems = [];
  const grasslandItems = [];

  // Coleções de Arquitetura de Brasília e Distrito Federal
  const urbanSuperquadras = [];
  const urbanMinistries = [];
  const urbanCongress = [];
  const urbanHousesWhite = [];
  const urbanHousesOchre = [];
  const urbanHousesGreen = [];
  const urbanHousesRose = [];
  const urbanSobrados = [];
  const urbanSobradosOchre = [];
  const urbanChurches = [];
  const urbanLanterns = [];
  const urbanTreesGreen = [];
  const urbanTreesDeepGreen = [];
  const urbanTreesYellow = [];
  const urbanTreesPink = [];

  const soybeanItems = [];
  const tempCropsItems = [];
  const wetlandItems = [];
  const bareItems = [];
  const waterItems = [];

  // Animais e Máquinas
  const cattleNeloreItems = [];
  const cattleSpottedItems = [];
  const cattleBrownItems = [];
  const horseItems = [];
  const tractorsGreenItems = [];
  const tractorsRedItems = [];
  const harvesterItems = [];

  // Função PRNG com Math.imul garantindo distribuição estocástica uniforme [0, 1) em qualquer semente e coordenada contínua
  function pHash(x, y, seed = 0) {
    const ix = Math.floor(x * 64);
    const iy = Math.floor(y * 64);
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // Materiais Impostores 2.5D (LOD 1 & 2) com AlphaTest
  const impostorMats = {
    forest: textures.impostors && textures.impostors.forest ? new THREE.MeshStandardMaterial({
      map: textures.impostors.forest,
      alphaTest: 0.45,
      roughness: 0.8,
      metalness: 0.04,
      side: THREE.DoubleSide
    }) : botanicalMat,
    cerrado_tree: textures.impostors && textures.impostors.cerrado_tree ? new THREE.MeshStandardMaterial({
      map: textures.impostors.cerrado_tree,
      alphaTest: 0.45,
      roughness: 0.8,
      metalness: 0.04,
      side: THREE.DoubleSide
    }) : botanicalMat,
    cerrado_shrub: textures.impostors && textures.impostors.cerrado_shrub ? new THREE.MeshStandardMaterial({
      map: textures.impostors.cerrado_shrub,
      alphaTest: 0.45,
      roughness: 0.8,
      metalness: 0.04,
      side: THREE.DoubleSide
    }) : botanicalMat,
    silviculture: textures.impostors && textures.impostors.silviculture ? new THREE.MeshStandardMaterial({
      map: textures.impostors.silviculture,
      alphaTest: 0.45,
      roughness: 0.8,
      metalness: 0.04,
      side: THREE.DoubleSide
    }) : botanicalMat,
    rocks: textures.impostors && textures.impostors.rocks ? new THREE.MeshStandardMaterial({
      map: textures.impostors.rocks,
      alphaTest: 0.45,
      roughness: 0.8,
      metalness: 0.04,
      side: THREE.DoubleSide
    }) : rockMat
  };

  // Geometrias Impostoras Cross-Quad 2.5D
  const impostorGeos = {
    forest: createCrossQuadGeometry(0.082, 0.095),
    cerrado_tree: createCrossQuadGeometry(0.065, 0.075),
    cerrado_shrub: createCrossQuadGeometry(0.042, 0.042),
    silviculture: createCrossQuadGeometry(0.045, 0.12),
    rocks: createCrossQuadGeometry(0.07, 0.05)
  };

  // 1. Definições de Todas as Camadas de Objetos 3D
  const layerDefs = [
    { key: 'forest', category: 'forest', type: 'botanical', geo: createTropicalTree3DGeo(), mat: botanicalMat, impostorGeo: impostorGeos.forest, impostorMat: impostorMats.forest, items: forestItems },
    { key: 'cerrado_trees', category: 'cerrado', type: 'botanical', geo: createCerradoTree3DGeo(), mat: botanicalMat, impostorGeo: impostorGeos.cerrado_tree, impostorMat: impostorMats.cerrado_tree, items: cerradoTreeItems },
    { key: 'cerrado_shrubs', category: 'cerrado', type: 'botanical', geo: createCerradoShrub3DGeo(), mat: botanicalMat, impostorGeo: impostorGeos.cerrado_shrub, impostorMat: impostorMats.cerrado_shrub, items: cerradoShrubItems },
    { key: 'rocks', category: 'rocks', type: 'rock', geo: createQuartziteRock3DGeo(), mat: rockMat, impostorGeo: impostorGeos.rocks, impostorMat: impostorMats.rocks, items: rocksItems },
    { key: 'pasture', category: 'pasture', type: 'micro', geo: create3DPastureTuftGeo(), mat: pastureMat, items: pastureItems },
    { key: 'silviculture', category: 'silviculture', type: 'botanical', geo: createEucalyptus3DGeo(), mat: botanicalMat, impostorGeo: impostorGeos.silviculture, impostorMat: impostorMats.silviculture, items: silvicultureItems },
    { key: 'grassland', category: 'grassland', type: 'micro', geo: createGrasslandNative3DGeo(), mat: pastureMat, items: grasslandItems },
    { key: 'urban_superquadras', category: 'urban', type: 'landmark', geo: createBrasiliaSuperquadraGeo(0), mat: urbanMat, items: urbanSuperquadras },
    { key: 'urban_ministries', category: 'urban', type: 'landmark', geo: createBrasiliaMinistryGeo(), mat: urbanMat, items: urbanMinistries },
    { key: 'urban_congress', category: 'urban', type: 'landmark', geo: createBrasiliaCongressGeo(), mat: urbanMat, items: urbanCongress },
    { key: 'urban_houses_white', category: 'urban', type: 'landmark', geo: createDetailedColonialHouseGeo(0), mat: urbanMat, items: urbanHousesWhite },
    { key: 'urban_houses_ochre', category: 'urban', type: 'landmark', geo: createDetailedColonialHouseGeo(1), mat: urbanMat, items: urbanHousesOchre },
    { key: 'urban_houses_green', category: 'urban', type: 'landmark', geo: createDetailedColonialHouseGeo(2), mat: urbanMat, items: urbanHousesGreen },
    { key: 'urban_houses_rose',  category: 'urban', type: 'landmark', geo: createDetailedColonialHouseGeo(3), mat: urbanMat, items: urbanHousesRose },
    { key: 'urban_sobrados',      category: 'urban', type: 'landmark', geo: createDetailedColonialSobradoGeo(0), mat: urbanMat, items: urbanSobrados },
    { key: 'urban_sobrados_ochre',category: 'urban', type: 'landmark', geo: createDetailedColonialSobradoGeo(1), mat: urbanMat, items: urbanSobradosOchre },
    { key: 'urban_churches',      category: 'urban', type: 'landmark', geo: createDetailedColonialChurchGeo(), mat: urbanMat, items: urbanChurches },
    { key: 'urban_lanterns',      category: 'urban', type: 'landmark', geo: createColonialLanternGeo(), mat: urbanMat, items: urbanLanterns },
    { key: 'urban_trees_green',      category: 'urban', type: 'landmark', geo: createColonialYardTreeGeo('green'),      mat: botanicalMat, items: urbanTreesGreen },
    { key: 'urban_trees_deep_green', category: 'urban', type: 'landmark', geo: createColonialYardTreeGeo('deep_green'), mat: botanicalMat, items: urbanTreesDeepGreen },
    { key: 'urban_trees_yellow',     category: 'urban', type: 'landmark', geo: createColonialYardTreeGeo('yellow'),     mat: botanicalMat, items: urbanTreesYellow },
    { key: 'urban_trees_pink',       category: 'urban', type: 'landmark', geo: createColonialYardTreeGeo('pink'),       mat: botanicalMat, items: urbanTreesPink },
    { key: 'soybean', category: 'soybean', type: 'botanical', geo: createSoybeanCrop3DGeo(), mat: botanicalMat, items: soybeanItems },
    { key: 'tempcrops', category: 'tempcrops', type: 'botanical', geo: createTemporaryCrop3DGeo(), mat: botanicalMat, items: tempCropsItems },
    { key: 'wetland', category: 'wetland', type: 'landmark', geo: createBuritiPalm3DGeo(), mat: botanicalMat, items: wetlandItems },
    { key: 'bare', category: 'bare', type: 'rock', geo: createBareGround3DGeo(), mat: rockMat, items: bareItems },
    { key: 'water', category: 'water', type: 'rock', geo: createRiverBank3DGeo(), mat: rockMat, items: waterItems },
    { key: 'cattle_nelore', category: 'cattle', type: 'landmark', geo: createNeloreCowGeo('nelore'), mat: rockMat, items: cattleNeloreItems },
    { key: 'cattle_spotted', category: 'cattle', type: 'landmark', geo: createNeloreCowGeo('spotted'), mat: rockMat, items: cattleSpottedItems },
    { key: 'cattle_brown', category: 'cattle', type: 'landmark', geo: createNeloreCowGeo('brown'), mat: rockMat, items: cattleBrownItems },
    { key: 'horses', category: 'cattle', type: 'landmark', geo: createHorseGeo(), mat: rockMat, items: horseItems },
    { key: 'tractors_green', category: 'machinery', type: 'landmark', geo: createTractorGeo(true), mat: urbanMat, items: tractorsGreenItems },
    { key: 'tractors_red', category: 'machinery', type: 'landmark', geo: createTractorGeo(false), mat: urbanMat, items: tractorsRedItems },
    { key: 'harvesters', category: 'machinery', type: 'landmark', geo: createHarvesterGeo(), mat: urbanMat, items: harvesterItems }
  ];

  // 2. Inicialização dos 32 Chunks Espaciais (Grade 8x4)
  const CHUNK_COLS = 8;
  const CHUNK_ROWS = 4;
  state.lodChunks = [];
  const chunkItemBuckets = [];

  for (let ry = 0; ry < CHUNK_ROWS; ry++) {
    for (let cx = 0; cx < CHUNK_COLS; cx++) {
      const idx = ry * CHUNK_COLS + cx;
      const x0 = (cx / CHUNK_COLS - 0.5) * geoW;
      const x1 = ((cx + 1) / CHUNK_COLS - 0.5) * geoW;
      const z0 = (ry / CHUNK_ROWS - 0.5) * geoH;
      const z1 = ((ry + 1) / CHUNK_ROWS - 0.5) * geoH;

      const chunkGroup = new THREE.Group();
      const solidGroup = new THREE.Group();
      const impostorGroup = new THREE.Group();
      const microGroup = new THREE.Group();
      const landmarkGroup = new THREE.Group();

      chunkGroup.add(solidGroup);
      chunkGroup.add(impostorGroup);
      chunkGroup.add(microGroup);
      chunkGroup.add(landmarkGroup);

      impostorGroup.visible = false; // Começa com LOD0 ativo próximo à câmera

      propsGroup.add(chunkGroup);

      state.lodChunks.push({
        id: `chunk_${cx}_${ry}`,
        index: idx,
        col: cx,
        row: ry,
        box: new THREE.Box3(
          new THREE.Vector3(x0, -1, z0),
          new THREE.Vector3(x1, state.baseHeight * state.exaggeration + 1.5, z1)
        ),
        center: new THREE.Vector3((x0 + x1) / 2, (state.baseHeight * state.exaggeration) / 2, (z0 + z1) / 2),
        group: chunkGroup,
        solidGroup,
        impostorGroup,
        microGroup,
        landmarkGroup,
        layers: {},
        solidCount: 0,
        impostorCount: 0,
        microCount: 0,
        landmarkCount: 0
      });

      chunkItemBuckets.push({});
    }
  }

  // 3. Distribuição Espacial dos Elementos nos Chunks
  function getChunkIndex(x, z) {
    const u = (x / geoW) + 0.5;
    const v = (z / geoH) + 0.5;
    const cx = Math.max(0, Math.min(CHUNK_COLS - 1, Math.floor(u * CHUNK_COLS)));
    const cy = Math.max(0, Math.min(CHUNK_ROWS - 1, Math.floor(v * CHUNK_ROWS)));
    return cy * CHUNK_COLS + cx;
  }

  for (const def of layerDefs) {
    propLayers[def.key] = { category: def.category, items: def.items };
    for (let i = 0; i < def.items.length; i++) {
      const it = def.items[i];
      const chIdx = getChunkIndex(it.x, it.z);
      if (!chunkItemBuckets[chIdx][def.key]) {
        chunkItemBuckets[chIdx][def.key] = [];
      }
      chunkItemBuckets[chIdx][def.key].push(it);
    }
  }

  // 4. Instanciação Otimizada por Chunk com Suporte a LOD0 (3D Sólido) e LOD1 (Impostor)
  const dummy = new THREE.Object3D();
  const s = state.props.scale;

  for (let chIdx = 0; chIdx < state.lodChunks.length; chIdx++) {
    const chunk = state.lodChunks[chIdx];
    const buckets = chunkItemBuckets[chIdx];

    for (const def of layerDefs) {
      const items = buckets[def.key];
      if (!items || items.length === 0) continue;

      const layerData = {
        category: def.category,
        type: def.type,
        items: items,
        solidMesh: null,
        impostorMesh: null
      };

      // 4.1 Malha Sólida (LOD 0)
      if (def.geo) {
        const solidMesh = new THREE.InstancedMesh(def.geo, def.mat, items.length);
        solidMesh.castShadow = state.props.castShadows;
        solidMesh.receiveShadow = false;
        solidMesh.visible = state.props.categories[def.category] && state.props.enabled;

        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          dummy.position.set(it.x, it.elev * state.baseHeight * state.exaggeration + (it.offsetY || 0), it.z);
          dummy.rotation.set(it.tiltX || 0, it.rotY, it.tiltZ || 0);
          dummy.scale.set(it.scaleX * s, it.scaleY * s, it.scaleZ * s);
          dummy.updateMatrix();
          solidMesh.setMatrixAt(i, dummy.matrix);
        }
        solidMesh.instanceMatrix.needsUpdate = true;
        layerData.solidMesh = solidMesh;

        if (def.type === 'micro') {
          chunk.microGroup.add(solidMesh);
          chunk.microCount += items.length;
        } else if (def.type === 'landmark') {
          chunk.landmarkGroup.add(solidMesh);
          chunk.landmarkCount += items.length;
        } else {
          chunk.solidGroup.add(solidMesh);
          chunk.solidCount += items.length;
        }
      }

      // 4.2 Malha Impostor 2.5D (LOD 1 & 2 para árvores e rochas)
      if (def.impostorGeo && def.impostorMat) {
        const impostorMesh = new THREE.InstancedMesh(def.impostorGeo, def.impostorMat, items.length);
        impostorMesh.castShadow = false; // Impostores distantes dispensam mapa de sombras caro
        impostorMesh.receiveShadow = false;
        impostorMesh.visible = state.props.categories[def.category] && state.props.enabled;

        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          dummy.position.set(it.x, it.elev * state.baseHeight * state.exaggeration + (it.offsetY || 0), it.z);
          dummy.rotation.set(it.tiltX || 0, it.rotY, it.tiltZ || 0);
          dummy.scale.set(it.scaleX * s, it.scaleY * s, it.scaleZ * s);
          dummy.updateMatrix();
          impostorMesh.setMatrixAt(i, dummy.matrix);
        }
        impostorMesh.instanceMatrix.needsUpdate = true;
        layerData.impostorMesh = impostorMesh;
        chunk.impostorGroup.add(impostorMesh);
        chunk.impostorCount += items.length;
      }

      chunk.layers[def.key] = layerData;
    }
  }

  const totalProps = forestItems.length + cerradoTreeItems.length + cerradoShrubItems.length +
                     rocksItems.length + pastureItems.length + silvicultureItems.length +
                     grasslandItems.length +
                     urbanSuperquadras.length + urbanMinistries.length + urbanCongress.length +
                     urbanHousesWhite.length + urbanHousesOchre.length + urbanHousesGreen.length + urbanHousesRose.length +
                     urbanSobrados.length + urbanSobradosOchre.length + urbanChurches.length + urbanLanterns.length +
                     urbanTreesGreen.length + urbanTreesDeepGreen.length + urbanTreesYellow.length + urbanTreesPink.length +
                     soybeanItems.length + tempCropsItems.length + wetlandItems.length +
                     bareItems.length + waterItems.length +
                     cattleNeloreItems.length + cattleSpottedItems.length + cattleBrownItems.length +
                     horseItems.length + tractorsGreenItems.length + tractorsRedItems.length + harvesterItems.length;

  state.totalPropsCount = totalProps;

  if (badgePropsCount) {
    badgePropsCount.textContent = totalProps.toLocaleString('pt-BR') + ' objetos 3D';
  }

  updateLODVisibility(true);
}

// 9. Atualização de Transformações de Props nos Chunks (Exagero & Escala)
function updatePropsTransforms() {
  if (!propsGroup || !state.lodChunks) return;
  const dummy = new THREE.Object3D();
  const s = state.props.scale;

  for (let chIdx = 0; chIdx < state.lodChunks.length; chIdx++) {
    const chunk = state.lodChunks[chIdx];
    chunk.box.min.y = -0.5;
    chunk.box.max.y = state.baseHeight * state.exaggeration + 1.5;
    chunk.center.y = (state.baseHeight * state.exaggeration) / 2;

    for (const key of Object.keys(chunk.layers)) {
      const layer = chunk.layers[key];
      const items = layer.items;
      const solidMesh = layer.solidMesh;
      const impostorMesh = layer.impostorMesh;

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        dummy.position.set(it.x, it.elev * state.baseHeight * state.exaggeration + (it.offsetY || 0), it.z);
        dummy.rotation.set(it.tiltX || 0, it.rotY, it.tiltZ || 0);
        dummy.scale.set(it.scaleX * s, it.scaleY * s, it.scaleZ * s);
        dummy.updateMatrix();

        if (solidMesh) solidMesh.setMatrixAt(i, dummy.matrix);
        if (impostorMesh) impostorMesh.setMatrixAt(i, dummy.matrix);
      }

      if (solidMesh) solidMesh.instanceMatrix.needsUpdate = true;
      if (impostorMesh) impostorMesh.instanceMatrix.needsUpdate = true;
    }
  }
}

// 10. Atualização do Exagero Vertical Dinâmico (Relevo + Props + Limites + Marcos)
function updateExaggeration(val) {
  state.exaggeration = val;
  if (!terrainGeometry || !rawElevations) return;

  const segW = terrainGeometry.parameters ? terrainGeometry.parameters.widthSegments : 622;
  const segH = terrainGeometry.parameters ? terrainGeometry.parameters.heightSegments : 382;
  const demW = state.demDimensions.width;
  const demH = state.demDimensions.height;
  const posAttr = terrainGeometry.attributes.position;
  const count = posAttr.count;

  for (let i = 0; i < count; i++) {
    const col = i % (segW + 1);
    const row = Math.floor(i / (segW + 1));
    const normU = col / segW;
    const normV = row / segH;
    const normElev = getBilinearElevation(normU, normV, demW, demH);
    const heightVal = normElev * state.baseHeight * state.exaggeration;
    posAttr.setY(i, heightVal);
  }

  posAttr.needsUpdate = true;
  terrainGeometry.computeVertexNormals();

  updatePropsTransforms();
  updateRoadsElevation();
  updateOSMLandmarksElevation();
  updateDFBoundaryElevation();
  updateSkirtElevation();
  updateLODVisibility(true);
}

// 10.1 Gerenciador de LOD Inteligente (Frustum Culling + Transição por Distância de Chunks)
const lodFrustum = new THREE.Frustum();
const lodProjMatrix = new THREE.Matrix4();
let lastLODCheckTime = 0;

function updateLODVisibility(force = false) {
  if (!state.lodChunks || !state.lodChunks.length || !camera) return;

  const now = performance.now();
  if (!force && now - lastLODCheckTime < 45) return; // Limita a ~22 verificações/segundo para 60 FPS estáveis
  lastLODCheckTime = now;

  let visibleChunks = 0;
  let activeProps = 0;
  const totalProps = state.totalPropsCount || 1;

  if (!state.lod.enabled) {
    // Modo Bruto (LOD Desativado): Desenha tudo em 3D sólido sem descarte
    for (let i = 0; i < state.lodChunks.length; i++) {
      const ch = state.lodChunks[i];
      ch.group.visible = true;
      ch.solidGroup.visible = true;
      ch.impostorGroup.visible = false;
      ch.microGroup.visible = true;
      ch.landmarkGroup.visible = true;
      activeProps += ch.solidCount + ch.microCount + ch.landmarkCount;
      visibleChunks++;
    }
  } else {
    // LOD Inteligente Ativo: Frustum Culling + Transição Distante
    lodProjMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    lodFrustum.setFromProjectionMatrix(lodProjMatrix);

    const camPos = camera.position;
    const nearSq = state.lod.nearDistance * state.lod.nearDistance;
    const farSq = state.lod.farDistance * state.lod.farDistance;

    for (let i = 0; i < state.lodChunks.length; i++) {
      const ch = state.lodChunks[i];

      // 1. Frustum Culling do Chunk
      if (state.lod.frustumCulling && !lodFrustum.intersectsBox(ch.box)) {
        ch.group.visible = false;
        continue;
      }

      ch.group.visible = true;
      visibleChunks++;

      // 2. Avaliação de Distância do Chunk à Câmera
      const distSq = camPos.distanceToSquared(ch.center);

      if (distSq < nearSq) {
        // LOD 0: Perto (< 35m) -> 3D Sólido completo + micro-props
        ch.solidGroup.visible = true;
        ch.impostorGroup.visible = false;
        ch.microGroup.visible = true;
        ch.landmarkGroup.visible = true;
        activeProps += ch.solidCount + ch.microCount + ch.landmarkCount;
      } else if (distSq < farSq) {
        // LOD 1: Médio (35 a 70m) -> Impostores 2.5D cross-quads, micro-props ocultos
        ch.solidGroup.visible = false;
        ch.impostorGroup.visible = true;
        ch.microGroup.visible = false;
        ch.landmarkGroup.visible = true;
        activeProps += ch.impostorCount + ch.landmarkCount;
      } else {
        // LOD 2: Longe (> 70m) -> Apenas impostores essenciais e marcos
        ch.solidGroup.visible = false;
        ch.impostorGroup.visible = true;
        ch.microGroup.visible = false;
        ch.landmarkGroup.visible = true;
        activeProps += ch.impostorCount + ch.landmarkCount;
      }
    }
  }

  state.visibleChunksCount = visibleChunks;
  state.activePropsCount = activeProps;

  // Atualização em tempo real das métricas do HUD
  if (statLodChunks) statLodChunks.textContent = `${visibleChunks} / ${state.lodChunks.length}`;
  if (statLodProps) statLodProps.textContent = `${activeProps.toLocaleString('pt-BR')}`;
  if (statLodSavings && totalProps > 0) {
    const savingsPct = Math.max(0, Math.min(99, Math.round((1 - activeProps / totalProps) * 100)));
    statLodSavings.textContent = `-${savingsPct}%`;
  }
}

// Atualização de Visibilidade por Categoria em todos os Chunks
function updateCategoryVisibility(catKey) {
  if (!state.lodChunks) return;
  const isVis = state.props.categories[catKey] && state.props.enabled;
  for (const chunk of state.lodChunks) {
    for (const key of Object.keys(chunk.layers)) {
      const layer = chunk.layers[key];
      if (layer.category === catKey) {
        if (layer.solidMesh) layer.solidMesh.visible = isVis;
        if (layer.impostorMesh) layer.impostorMesh.visible = isVis;
      }
    }
  }
  updateLODVisibility(true);
}

// 11. Layer & Opacity Control
function applyLayerMode() {
  if (!terrainMesh || !overlayMesh) return;

  const opacityGroup = document.getElementById('group-opacity');

  if (state.activeLayer === 'satellite') {
    terrainMesh.material.map = textures.satellite;
    terrainMesh.material.color.setHex(0xffffff);
    overlayMesh.visible = false;
    if (opacityGroup) opacityGroup.style.display = 'none';

  } else if (state.activeLayer === 'blend') {
    terrainMesh.material.map = textures.satellite;
    terrainMesh.material.color.setHex(0xffffff);
    overlayMesh.visible = true;
    overlayMesh.material.map = textures.mapbiomas;
    overlayMesh.material.opacity = state.mapbiomasOpacity;
    if (opacityGroup) opacityGroup.style.display = 'flex';

  } else if (state.activeLayer === 'mapbiomas') {
    terrainMesh.material.map = textures.mapbiomas;
    terrainMesh.material.color.setHex(0xffffff);
    overlayMesh.visible = false;
    if (opacityGroup) opacityGroup.style.display = 'none';

  } else if (state.activeLayer === 'hypsometric') {
    terrainMesh.material.map = textures.hypsometric;
    terrainMesh.material.color.setHex(0xffffff);
    overlayMesh.visible = false;
    if (opacityGroup) opacityGroup.style.display = 'none';
  }

  const resGroup = document.getElementById('group-texture-res');
  if (resGroup) {
    resGroup.style.display = (state.activeLayer === 'satellite' || state.activeLayer === 'blend') ? 'flex' : 'none';
  }

  terrainMesh.material.needsUpdate = true;
  overlayMesh.material.needsUpdate = true;
}

// 11.1 Dynamic Satellite Texture Resolution Switcher (4K, 8K, 12K Ultra)
async function setSatelliteResolution(res) {
  if (state.satResolution === res) return;
  const badge = document.getElementById('badge-sat-res');

  const maxTex = renderer ? renderer.capabilities.maxTextureSize : 8192;
  if (res === '12k' && maxTex < 12000) {
    alert(`Atenção: Sua GPU/WebGL reporta limite máximo de textura de ${maxTex}px. O modo 8K (8.192px) é o limite seguro do seu hardware.`);
    return;
  }

  document.querySelectorAll('#btn-group-sat-res .seg-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.res === res);
  });

  state.satResolution = res;
  const labelMap = {
    '4k': '4K (4.096px)',
    '8k': '8K (8.192px)',
    '12k': '12K Ultra (12.288px)'
  };

  const loader = new THREE.TextureLoader();
  const maxAniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;

  let tex = textures['sat' + res];
  if (!tex) {
    if (badge) badge.textContent = `Carregando ${res.toUpperCase()}...`;
    const url = res === '12k' ? 'public/satellite_texture_12k.jpg' :
                res === '8k'  ? 'public/satellite_texture_8k.jpg' :
                                'public/satellite_texture_4k.jpg';
    try {
      tex = await new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = maxAniso;
      textures['sat' + res] = tex;
    } catch (err) {
      console.error('Erro ao carregar textura ' + res + ':', err);
      if (badge) badge.textContent = 'Erro ao carregar';
      return;
    }
  }

  if (badge) badge.textContent = labelMap[res] || res;
  textures.satellite = tex;

  if (terrainMesh && (state.activeLayer === 'satellite' || state.activeLayer === 'blend')) {
    terrainMesh.material.map = textures.satellite;
    terrainMesh.material.needsUpdate = true;
  }
}

// 12. Camera Presets (Calibrados para Escala 1:1 Real)
function setCameraPreset(preset) {
  document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.btn-preset[data-view="${preset}"]`);
  if (btn) btn.classList.add('active');

  if (preset === 'panoramica') {
    animateCamera(-35, 65, 95, 0, 0.5, 0, 1400);
  } else if (preset === 'plano_piloto') {
    // Esplanada dos Ministérios, Congresso Nacional e Eixo Monumental de Brasília
    animateCamera(-22.0, 3.8, 18.0, -12.63, 0.66, 4.77, 1200);
  } else if (preset === 'lago_paranoa') {
    // Bacia do Lago Paranoá, Pontão e Ponte JK
    animateCamera(-15.0, 3.5, 20.0, -5.97, 0.56, 9.26, 1200);
  } else if (preset === 'parque_nacional') {
    // Parque Nacional de Brasília (Água Mineral / Cerrado Típico)
    animateCamera(-40.0, 3.8, -5.0, -31.17, 0.62, -14.69, 1200);
  } else if (preset === 'soja') {
    // Lavouras mecanizadas de Soja do PAD-DF
    animateCamera(61.5, 2.2, 36.5, 66.92, 0.35, 29.48, 1200);
  } else if (preset === 'maquinario') {
    // Colheitadeiras Draper e tratores em operação nos talhões do DF
    animateCamera(66.2, 0.65, 30.1, 67.2, 0.35, 29.2, 1200);
  } else if (preset === 'pico_roncador') {
    // Chapada da Contagem / Ponto mais alto do DF (1.341m)
    animateCamera(-25.0, 4.2, -35.0, -16.28, 1.15, -45.51, 1200);
  } else if (preset === 'rebanho') {
    // Rebanhos bovinos Nelore e cavalos em Brazlândia
    animateCamera(-76.2, 0.95, -17.0, -77.15, 0.68, -17.97, 1200);
  } else if (preset === 'silvicultura') {
    // Talhões de Eucalipto com corredores de manejo florestal
    animateCamera(71.0, 1.8, -45.0, 72.75, 0.38, -48.29, 1200);
  } else if (preset === 'congresso') {
    // Congresso Nacional (Torres Gêmeas e Cúpulas da Câmara e Senado)
    animateCamera(-13.5, 0.85, 4.75, -12.55, 0.68, 4.75, 1200);
  } else if (preset === 'ponte_jk') {
    // Ponte Juscelino Kubitschek (Ponte JK) sobre o Lago Paranoá
    animateCamera(-7.8, 1.15, 11.0, -5.97, 0.56, 9.44, 1200);
  } else if (preset === 'catedral') {
    // Catedral Metropolitana de Brasília (Oscar Niemeyer)
    animateCamera(-15.4, 0.86, 5.0, -14.75, 0.70, 4.51, 1200);
  } else if (preset === 'torre_tv') {
    // Torre de TV de Brasília (Lúcio Costa)
    animateCamera(-19.5, 1.45, 4.2, -18.08, 0.85, 3.05, 1200);
  } else if (preset === 'estadio_garrincha') {
    // Arena BRB Mané Garrincha
    animateCamera(-20.15, 1.15, 2.25, -19.35, 0.76, 1.64, 1200);
  } else if (preset === 'praca_tres_poderes') {
    // Praça dos Três Poderes (Planalto, Congresso e STF)
    animateCamera(-12.95, 0.95, 5.45, -12.11, 0.68, 4.80, 1200);
  } else if (preset === 'palacio_alvorada') {
    // Palácio da Alvorada na Península do Lago Paranoá
    animateCamera(-5.15, 0.75, 3.75, -4.54, 0.56, 3.22, 1200);
  } else {
    animateCamera(-35, 65, 95, 0, 0.5, 0, 1400);
  }
}

let activeCameraAnimId = null;

function animateCamera(targetX, targetY, targetZ, lookX, lookY, lookZ, duration = 1200) {
  if (activeCameraAnimId) {
    cancelAnimationFrame(activeCameraAnimId);
    activeCameraAnimId = null;
  }

  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const endPos = new THREE.Vector3(targetX, targetY, targetZ);
  const endTarget = new THREE.Vector3(lookX, lookY, lookZ);

  let progress = 0;
  const startTime = performance.now();

  function step(now) {
    progress = Math.min(1, (now - startTime) / duration);
    const ease = 0.5 - Math.cos(progress * Math.PI) / 2;

    camera.position.lerpVectors(startPos, endPos, ease);
    controls.target.lerpVectors(startTarget, endTarget, ease);
    controls.update();
  updateLODVisibility();

    if (progress < 1) {
      activeCameraAnimId = requestAnimationFrame(step);
    } else {
      activeCameraAnimId = null;
    }
  }

  activeCameraAnimId = requestAnimationFrame(step);
}

// 13. UI Event Listeners
function setupEventListeners() {
  sliderExaggeration.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valExaggeration.textContent = val.toFixed(1) + (val === 1.0 ? 'x (1:1 Real)' : 'x');
    updateExaggeration(val);
  });

  sliderSunAzimuth.addEventListener('input', (e) => {
    state.sunAzimuth = parseInt(e.target.value);
    valSunAzimuth.textContent = state.sunAzimuth + '°';
    updateSunPosition();
  });

  sliderSunElevation.addEventListener('input', (e) => {
    state.sunElevation = parseInt(e.target.value);
    valSunElevation.textContent = state.sunElevation + '°';
    updateSunPosition();
  });

  sliderOpacity.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    valOpacity.textContent = val + '%';
    state.mapbiomasOpacity = val / 100.0;
    if (overlayMesh) {
      overlayMesh.material.opacity = state.mapbiomasOpacity;
    }
  });

  // Props Controls
  if (checkProps) {
    checkProps.addEventListener('change', (e) => {
      state.props.enabled = e.target.checked;
      if (propsGroup) propsGroup.visible = state.props.enabled;
    });

        // Marcos e Monumentos 3D (OSM)
    const checkLandmarks = document.getElementById('check-landmarks');
    if (checkLandmarks) {
      checkLandmarks.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        if (!state.landmarks) state.landmarks = {};
        state.landmarks.enabled = enabled;

        // Desliga/liga todos os marcos e monumentos 3D (Congresso, STF, Planalto, Catedral, Ponte JK, Torre de TV)
        if (osmLandmarksGroup) osmLandmarksGroup.visible = enabled;

        // Desliga/liga também os blocos ministeriais da Esplanada
        if (propLayers && propLayers['urban_ministries']) {
          propLayers['urban_ministries'].visible = enabled;
        }

        const badgeLandmarks = document.getElementById('badge-landmarks-count');
        if (badgeLandmarks) {
          badgeLandmarks.textContent = enabled ? 'Ativo' : 'Desativado';
          badgeLandmarks.style.color = enabled ? '#c084fc' : '#94a3b8';
          badgeLandmarks.style.background = enabled ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255, 255, 255, 0.05)';
        }
      });
    }

    const sliderLandmarksScale = document.getElementById('slider-landmarks-scale');
    const valLandmarksScale = document.getElementById('val-landmarks-scale');
    if (sliderLandmarksScale) {
      sliderLandmarksScale.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (valLandmarksScale) valLandmarksScale.textContent = val.toFixed(1) + 'x';
        updateLandmarksScale(val);
      });
    }

    const checkRoads = document.getElementById('check-roads');
    if (checkRoads) {
      checkRoads.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        if (!state.roads) state.roads = {};
        state.roads.enabled = enabled;
        if (roadsLineMesh) {
          roadsLineMesh.visible = enabled;
        }
      });
    }

  }

  if (checkPropsShadows) {
    checkPropsShadows.addEventListener('change', (e) => {
      state.props.castShadows = e.target.checked;
      for (const key of Object.keys(propLayers)) {
        propLayers[key].mesh.castShadow = state.props.castShadows;
      }
    });
  }

  if (sliderPropScale) {
    sliderPropScale.addEventListener('input', (e) => {
      state.props.scale = parseFloat(e.target.value);
      if (valPropScale) {
        valPropScale.textContent = state.props.scale.toFixed(1) + (state.props.scale === 1.0 ? 'x (1:1 Botânico)' : 'x');
      }
      updatePropsTransforms();
  updateRoadsElevation();
  updateOSMLandmarksElevation();
  updateOSMLandmarksElevation();
    });
  }

  // 8.2 Controle Segmentado de Densidade de Vegetação e Props
  function setPropsDensity(newDensity) {
    state.props.density = newDensity;

    const labelMap = {
      0.5: '0.5x (Leve)',
      1.0: '1.0x (Padrão)',
      1.5: '1.5x (Média)',
      2.0: '2.0x (Alta)',
      3.0: '3.0x (Ultra 3x)'
    };

    if (valPropDensity) {
      valPropDensity.textContent = labelMap[newDensity] || (newDensity.toFixed(1) + 'x');
    }

    document.querySelectorAll('.btn-density').forEach(btn => {
      const bD = parseFloat(btn.dataset.density);
      btn.classList.toggle('active', Math.abs(bD - newDensity) < 0.05);
    });

    if (state.props.enabled) {
      buildPropsMeshes();
    }
  }

  window.setPropsDensity = setPropsDensity;

  // 🌿 Slider Contínuo de Densidade de Props (0.5x a 5.0x) com Debounce
  let densityDebounceTimer = null;

  function formatDensityLabel(val) {
    if (val < 0.9) return `${val.toFixed(1)}x (Econômico)`;
    if (val <= 1.2) return `${val.toFixed(1)}x (Padrão 1:1)`;
    if (val <= 2.2) return `${val.toFixed(1)}x (Alta Densidade)`;
    if (val <= 3.8) return `${val.toFixed(1)}x (Ultra Densa)`;
    return `${val.toFixed(1)}x (Hiper-Densidade 🔥)`;
  }

  function updateDensityUI(val) {
    const txt = formatDensityLabel(val);
    if (valPropDensity) valPropDensity.textContent = txt;
    if (valPropDensitySettings) valPropDensitySettings.textContent = txt;
    if (badgeDensityMultiplier) badgeDensityMultiplier.textContent = `${val.toFixed(1)}x`;
    if (densityHelperText) {
      if (val > 3.8) {
        densityHelperText.textContent = 'Mais de 2M de instâncias ativas!';
        densityHelperText.style.color = '#c084fc';
      } else if (val > 2.0) {
        densityHelperText.textContent = 'Cerrado e áreas densificadas';
        densityHelperText.style.color = 'var(--accent-green)';
      } else {
        densityHelperText.textContent = 'Equilibrada para 60 FPS';
        densityHelperText.style.color = 'var(--text-muted)';
      }
    }
  }

  function onDensityInput(e) {
    const val = parseFloat(e.target.value);
    if (sliderPropDensity && sliderPropDensity !== e.target) sliderPropDensity.value = val;
    if (sliderPropDensitySettings && sliderPropDensitySettings !== e.target) sliderPropDensitySettings.value = val;
    updateDensityUI(val);

    clearTimeout(densityDebounceTimer);
    densityDebounceTimer = setTimeout(() => {
      state.props.density = val;
      if (state.props.enabled) {
        buildPropsMeshes();
      }
    }, 220);
  }

  if (sliderPropDensity) {
    sliderPropDensity.addEventListener('input', onDensityInput);
  }
  if (sliderPropDensitySettings) {
    sliderPropDensitySettings.addEventListener('input', onDensityInput);
  }

  // ⚙️ Gerenciador do Menu Flutuante de Ajustes & Otimizações
  function toggleSettingsPanel() {
    if (!settingsPanel) return;
    const isAct = settingsPanel.classList.toggle('active');
    if (btnOpenSettings) btnOpenSettings.classList.toggle('active', isAct);
  }

  function closeSettingsPanel() {
    if (!settingsPanel) return;
    settingsPanel.classList.remove('active');
    if (btnOpenSettings) btnOpenSettings.classList.remove('active');
  }

  if (btnOpenSettings) btnOpenSettings.addEventListener('click', toggleSettingsPanel);
  if (btnOpenSettingsSide) btnOpenSettingsSide.addEventListener('click', toggleSettingsPanel);
  if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeSettingsPanel);

  // Toggle de Limites Territoriais do DF (IBGE)
  const chkDFBoundary = document.getElementById('check-df-boundary');
  if (chkDFBoundary) {
    chkDFBoundary.addEventListener('change', (e) => {
      if (dfBoundaryGroup) {
        dfBoundaryGroup.visible = e.target.checked;
      }
    });
  }

  // Botão "🎯 Resetar para Escala 1:1 Real"
  const btnScale1to1 = document.getElementById('btn-scale-1to1');
  if (btnScale1to1) {
    btnScale1to1.addEventListener('click', () => {
      sliderExaggeration.value = '1.0';
      valExaggeration.textContent = '1.0x (1:1 Real)';
      updateExaggeration(1.0);

      if (sliderPropScale) {
        sliderPropScale.value = '1.0';
        if (valPropScale) valPropScale.textContent = '1.0x (1:1 Botânico)';
        state.props.scale = 1.0;
        updatePropsTransforms();
  updateRoadsElevation();
  updateOSMLandmarksElevation();
  updateOSMLandmarksElevation();
      }

      // Transição suave para enquadramento equilibrado em escala 1:1
      animateCamera(-35, 65, 95, 0, 0.5, 0);
    });
  }

  // Props Individual Category Chips
  document.querySelectorAll('.prop-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const propKey = chip.dataset.prop;
      const isActive = chip.classList.contains('active');
      if (isActive) {
        chip.classList.remove('active');
        chip.classList.add('disabled');
        state.props.categories[propKey] = false;
      } else {
        chip.classList.add('active');
        chip.classList.remove('disabled');
        state.props.categories[propKey] = true;
      }
      updateCategoryVisibility(propKey);
    });
  });

  // Layer buttons
  document.querySelectorAll('#btn-group-layer .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#btn-group-layer .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeLayer = btn.dataset.layer;
      applyLayerMode();
    });
  });

  // Satellite Resolution buttons (4K, 8K, 12K Ultra)
  document.querySelectorAll('#btn-group-sat-res .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setSatelliteResolution(btn.dataset.res);
    });
  });

  // Camera preset buttons
  document.querySelectorAll('.btn-preset').forEach(btn => {
    if (btn.id === 'btn-scale-1to1') return; // Manipulado separadamente
    btn.addEventListener('click', () => {
      setCameraPreset(btn.dataset.view);
    });
  });

  // Turntable
  checkTurntable.addEventListener('change', (e) => {
    state.turntable = e.target.checked;
    controls.autoRotate = state.turntable;
    controls.autoRotateSpeed = 1.2;
  });

  // Wireframe
  checkWireframe.addEventListener('change', (e) => {
    state.wireframe = e.target.checked;
    if (terrainMesh) {
      terrainMesh.material.wireframe = state.wireframe;
    }
  });

  // Reset view
  btnResetView.addEventListener('click', () => {
    animateCamera(-35, 65, 95, 0, 0.5, 0);
  });

  // Reorientar Câmera para o Norte Geográfico
  function resetOrientationNorth() {
    if (!camera || !controls) return;
    const tx = controls.target.x;
    const ty = controls.target.y;
    const tz = controls.target.z;

    const dist = camera.position.distanceTo(controls.target);
    const currentPhi = controls.getPolarAngle();
    const phi = Math.max(0.20, Math.min(Math.PI / 2 - 0.05, currentPhi));

    // Alinhar ao Norte (azimuth = 0):
    // Câmera posiciona-se ao Sul (+Z) do ponto de foco, olhando para o Norte (-Z)
    const targetX = tx;
    const targetY = ty + dist * Math.cos(phi);
    const targetZ = tz + dist * Math.sin(phi);

    animateCamera(targetX, targetY, targetZ, tx, ty, tz, 750);
  }

  // Compass widget click
  if (compassWidget) {
    compassWidget.addEventListener('click', resetOrientationNorth);
  }

  

  // Funções de visibilidade dos painéis flutuantes (HUD)
  function hideControlPanel() {
    if (controlPanel) controlPanel.classList.add('minimized');
    if (btnShowPanel) btnShowPanel.classList.add('active');
    updateMasterToggleButton();
  }

  function showControlPanel() {
    if (controlPanel) controlPanel.classList.remove('minimized');
    if (btnShowPanel) btnShowPanel.classList.remove('active');
    updateMasterToggleButton();
  }

  function hideLegendPanel() {
    if (legendPanel) legendPanel.classList.add('minimized');
    if (btnShowLegend) btnShowLegend.classList.add('active');
    updateMasterToggleButton();
  }

  function showLegendPanel() {
    if (legendPanel) legendPanel.classList.remove('minimized');
    if (btnShowLegend) btnShowLegend.classList.remove('active');
    updateMasterToggleButton();
  }

  function updateMasterToggleButton() {
    if (!labelToggleAll || !iconToggleAll) return;
    const isControlMin = controlPanel && controlPanel.classList.contains('minimized');
    const isLegendMin = !legendPanel || legendPanel.classList.contains('minimized');
    if (isControlMin && isLegendMin) {
      labelToggleAll.textContent = 'Exibir Menus';
      iconToggleAll.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
    } else {
      labelToggleAll.textContent = 'Ocultar Menus';
      iconToggleAll.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    }
  }

  function toggleAllMenus() {
    const isControlMin = controlPanel && controlPanel.classList.contains('minimized');
    const isLegendMin = !legendPanel || legendPanel.classList.contains('minimized');
    if (isControlMin && isLegendMin) {
      showControlPanel();
      showLegendPanel();
    } else {
      hideControlPanel();
      hideLegendPanel();
    }
  }

  if (btnTogglePanel) btnTogglePanel.addEventListener('click', hideControlPanel);
  if (btnShowPanel) btnShowPanel.addEventListener('click', showControlPanel);
  if (btnToggleLegend) btnToggleLegend.addEventListener('click', hideLegendPanel);
  if (btnShowLegend) btnShowLegend.addEventListener('click', showLegendPanel);
  if (btnToggleAllMenus) btnToggleAllMenus.addEventListener('click', toggleAllMenus);

  // Modal de Estatísticas de Área & Classes
  const modalStats = document.getElementById('modal-stats');
  const btnOpenStats = document.getElementById('btn-open-stats');
  const btnCloseStats = document.getElementById('btn-close-stats');
  const btnCloseStatsFooter = document.getElementById('btn-close-stats-footer');
  const btnCopyStats = document.getElementById('btn-copy-stats');
  const btnExportCsv = document.getElementById('btn-export-csv');

  function openStatsModal() {
    if (modalStats) modalStats.classList.add('active');
  }

  function closeStatsModal() {
    if (modalStats) modalStats.classList.remove('active');
  }

  if (btnOpenStats) btnOpenStats.addEventListener('click', openStatsModal);
  if (btnCloseStats) btnCloseStats.addEventListener('click', closeStatsModal);
  if (btnCloseStatsFooter) btnCloseStatsFooter.addEventListener('click', closeStatsModal);

  if (modalStats) {
    modalStats.addEventListener('click', (e) => {
      if (e.target === modalStats) closeStatsModal();
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalStats && modalStats.classList.contains('active')) {
      closeStatsModal();
    }
  });

  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', exportStatisticsCSV);
  }

  if (btnCopyStats) {
    btnCopyStats.addEventListener('click', () => copyStatisticsSummary(btnCopyStats));
  }
}

// Exportação CSV das estatísticas territoriais
function exportStatisticsCSV() {
  if (!state.metadata || !state.metadata.classes) return;
  let csv = 'ID,Classe_PT,Classe_EN,Grupo,Pixels_30m,Area_ha,Area_km2,Percentual\r\n';
  state.metadata.classes.forEach(c => {
    const ha = c.area_ha || (c.count * 0.09);
    const km2 = c.area_km2 || (ha / 100);
    csv += `"${c.id}","${c.name_pt}","${c.name_en || ''}","${c.group || ''}",${c.count},${ha.toFixed(2)},${km2.toFixed(4)},${c.percentage.toFixed(2)}\r\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mapbiomas_estatisticas_serra_dourada.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Cópia rápida do resumo estatístico
function copyStatisticsSummary(btn) {
  if (!state.metadata || !state.metadata.statistics) return;
  const s = state.metadata.statistics;
  let summary = `MapBiomas Brasil Col. 11 (2025) - Estatísticas Territoriais da Serra Dourada (GO)\n`;
  summary += `Área Total Mapeada: ${s.total_area_ha.toLocaleString('pt-BR')} ha (${s.total_area_km2.toLocaleString('pt-BR')} km² | ${s.total_pixels.toLocaleString('pt-BR')} pixels de 30m)\n\n`;
  summary += `Balanço por Macrogrupo:\n`;
  s.groups.forEach(g => {
    summary += `• ${g.name}: ${g.area_ha.toLocaleString('pt-BR')} ha (${g.percentage.toFixed(2)}%)\n`;
  });
  summary += `\nClasses Individuais de Uso e Cobertura:\n`;
  state.metadata.classes.forEach(c => {
    summary += `• ${c.name_pt}: ${(c.area_ha || c.count * 0.09).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ha (${c.percentage.toFixed(2)}%)\n`;
  });

  navigator.clipboard.writeText(summary).then(() => {
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span style="color: var(--accent-green); font-weight: 700;">✓ Copiado!</span>`;
    setTimeout(() => {
      btn.innerHTML = originalText;
    }, 2000);
  }).catch(() => {
    alert('Resumo copiado com sucesso.');
  });
}

function onWindowResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

// 14. Render Animation Loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  // Deslocamento suave das nuvens no céu
  if (cloudMesh && cloudMesh.material && cloudMesh.material.map) {
    cloudMesh.material.map.offset.x += 0.00004;
    cloudMesh.material.map.offset.y += 0.000018;
  }

  if (compassRose && camera) {
    const az = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    const deg = THREE.MathUtils.radToDeg(az);
    compassRose.style.transform = `rotate(${deg}deg)`;
  }

  renderer.render(scene, camera);
}

// 13. Pipeline de Dados Multi-Resolução (LOD de Processamento e Transmissão)
async function setDataPipelineLOD(dlod) {
  state.dataLod = dlod;
  updateProgress(20, 'Carregando dados altimétricos LOD...');
  if (loadingOverlay) {
    loadingOverlay.style.display = 'flex';
    loadingOverlay.classList.remove('fade-out');
  }

  try {
    if (dlod === 'lod1') {
      updateProgress(40, 'Carregando classes LOD 1 (2.1 MB - 4x mais leve)...');
      const cResp = await fetch('public/classes_lod1.bin');
      rawClasses = new Uint8Array(await cResp.arrayBuffer());

      updateProgress(65, 'Carregando elevação LOD 1 (8.5 MB - 4x mais leve)...');
      const eResp = await fetch('public/elevation_lod1.bin');
      rawElevations = new Float32Array(await eResp.arrayBuffer());

      state.demDimensions = { width: 1869, height: 1147 };
    } else {
      updateProgress(40, 'Carregando classes 30m (8.5 MB)...');
      const cResp = await fetch('public/classes.bin');
      rawClasses = new Uint8Array(await cResp.arrayBuffer());

      updateProgress(65, 'Carregando elevação 30m (34.3 MB)...');
      const eResp = await fetch('public/elevation.bin');
      rawElevations = new Float32Array(await eResp.arrayBuffer());

      state.demDimensions = { width: 3738, height: 2294 };
    }

    updateProgress(80, 'Atualizando malha do terreno e pedestal...');
    buildTerrainMesh();

    updateProgress(88, 'Ajustando marcos, vias e limites oficiais...');
    updateRoadsElevation();
    updateOSMLandmarksElevation();
    updateDFBoundaryElevation();
    updateSkirtElevation();

    updateProgress(94, 'Redistribuindo objetos e particionando chunks LOD...');
    buildPropsMeshes();

    updateProgress(100, 'Pronto!');
    setTimeout(() => {
      if (loadingOverlay) {
        loadingOverlay.classList.add('fade-out');
        setTimeout(() => { loadingOverlay.style.display = 'none'; }, 500);
      }
    }, 400);
  } catch (err) {
    console.error('Erro ao alternar pipeline LOD:', err);
    if (loadingOverlay) {
      loadingOverlay.classList.add('fade-out');
      setTimeout(() => { loadingOverlay.style.display = 'none'; }, 500);
    }
  }
}

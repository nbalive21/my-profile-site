import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const TEXTURES = {
  day:    'https://cdn.jsdelivr.net/gh/turban/webgl-earth@master/images/2_no_clouds_4k.jpg',
  water:  'https://cdn.jsdelivr.net/gh/turban/webgl-earth@master/images/water_4k.png',
  clouds: 'https://cdn.jsdelivr.net/gh/turban/webgl-earth@master/images/fair_clouds_4k.png',
  lights: 'https://threejs.org/examples/textures/planets/earth_lights_2048.png',
};

const canvas = document.getElementById('earth-canvas');
const loading = document.getElementById('loading');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(2.5, 0.6, 2.8);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const SUN_DIRECTION = new THREE.Vector3(-1, 0.25, 0.85).normalize();

const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
sunLight.position.copy(SUN_DIRECTION).multiplyScalar(10);
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0x1a2a44, 0.18));

const isMobile = window.matchMedia('(max-width: 768px)').matches;
const starCount = isMobile ? 1800 : 6000;
const starGeometry = new THREE.BufferGeometry();
const starPositions = new Float32Array(starCount * 3);
const starColors = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  const r = 80 + Math.random() * 80;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  starPositions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
  starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
  starPositions[i * 3 + 2] = r * Math.cos(phi);
  const tint = 0.7 + Math.random() * 0.3;
  const blueTint = Math.random() < 0.2 ? 0.85 : 1.0;
  starColors[i * 3]     = tint * blueTint;
  starColors[i * 3 + 1] = tint * (Math.random() < 0.15 ? 0.8 : 1.0);
  starColors[i * 3 + 2] = tint;
}
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
const stars = new THREE.Points(
  starGeometry,
  new THREE.PointsMaterial({
    size: 0.55,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  })
);
scene.add(stars);

const loader = new THREE.TextureLoader();
loader.crossOrigin = 'anonymous';
const loadTex = (url, colorSpace = THREE.NoColorSpace) =>
  new Promise((resolve) => {
    loader.load(
      url,
      (tex) => { tex.colorSpace = colorSpace; tex.anisotropy = 8; resolve(tex); },
      undefined,
      () => resolve(null)
    );
  });

const earthGroup = new THREE.Group();
earthGroup.rotation.z = 0.41;
scene.add(earthGroup);

let earthMesh, cloudMesh;

const EARTH_RADIUS = 1.0;
const CLOUD_RADIUS = 1.008;
const ATMO_RADIUS  = 1.14;

const earthVertex = `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const earthFragment = `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D waterMap;
  uniform vec3 sunDirection;
  uniform vec3 cameraPos;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 L = normalize(sunDirection);
    vec3 V = normalize(cameraPos - vWorldPos);

    vec3 dayColor   = texture2D(dayMap, vUv).rgb;
    vec3 nightColor = texture2D(nightMap, vUv).rgb;
    float water     = texture2D(waterMap, vUv).r;

    float lambert = dot(N, L);
    float dayFactor = smoothstep(-0.18, 0.22, lambert);

    // City lights only on the dark side, attenuated over oceans
    vec3 lights = nightColor * 3.2 * (1.0 - water * 0.85) * (1.0 - dayFactor);

    // Soft global day illumination
    vec3 lit = dayColor * (0.22 + 1.0 * max(lambert, 0.0));

    // Ocean specular highlight (sun glint)
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 48.0) * water * 0.9 * step(0.0, lambert);

    // Warm terminator glow where day meets night
    float terminator = 1.0 - smoothstep(0.0, 0.22, abs(lambert));
    vec3 termGlow = vec3(1.0, 0.42, 0.14) * terminator * 0.28 * smoothstep(-0.3, 0.08, lambert);

    vec3 color = mix(lights, lit, dayFactor) + spec + termGlow;

    // Subtle blue rim haze inside the disk (atmosphere scattering)
    float rim = pow(1.0 - max(dot(N, V), 0.0), 2.8);
    color += vec3(0.28, 0.58, 1.0) * rim * 0.22 * smoothstep(-0.1, 0.3, lambert);

    gl_FragColor = vec4(color, 1.0);
  }
`;

const atmosphereVertex = `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const atmosphereFragment = `
  uniform vec3 sunDirection;
  uniform vec3 cameraPos;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPos - vWorldPos);
    vec3 L = normalize(sunDirection);

    // BackSide rendering, so flip for outward fresnel
    float fresnel = pow(1.0 - max(dot(-N, V), 0.0), 3.0);

    float sunDot = dot(N, L);
    float dayMask = smoothstep(-0.4, 0.4, sunDot);

    vec3 dayBlue   = vec3(0.35, 0.62, 1.0);
    vec3 dusk      = vec3(0.85, 0.45, 0.55);
    vec3 nightTint = vec3(0.02, 0.04, 0.12);

    float dusky = (1.0 - smoothstep(0.0, 0.35, abs(sunDot))) * 0.7;
    vec3 col = mix(nightTint, dayBlue, dayMask);
    col = mix(col, dusk, dusky);

    float alpha = fresnel * (0.55 + 0.45 * dayMask);
    gl_FragColor = vec4(col, alpha);
  }
`;

const cloudFragment = `
  uniform sampler2D cloudMap;
  uniform vec3 sunDirection;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    float c = texture2D(cloudMap, vUv).r;
    vec3 N = normalize(vWorldNormal);
    vec3 L = normalize(sunDirection);
    float lambert = max(dot(N, L), 0.0);
    float dayFactor = smoothstep(-0.15, 0.2, dot(N, L));
    vec3 color = vec3(1.0) * (0.15 + 0.85 * lambert);
    float alpha = c * (0.15 + 0.75 * dayFactor);
    gl_FragColor = vec4(color, alpha);
  }
`;

Promise.all([
  loadTex(TEXTURES.day,    THREE.SRGBColorSpace),
  loadTex(TEXTURES.water,  THREE.NoColorSpace),
  loadTex(TEXTURES.clouds, THREE.NoColorSpace),
  loadTex(TEXTURES.lights, THREE.SRGBColorSpace),
]).then(([dayTex, waterTex, cloudsTex, lightsTex]) => {

  const earthMaterial = new THREE.ShaderMaterial({
    uniforms: {
      dayMap:       { value: dayTex },
      nightMap:     { value: lightsTex },
      waterMap:     { value: waterTex },
      sunDirection: { value: SUN_DIRECTION.clone() },
      cameraPos:    { value: camera.position.clone() },
    },
    vertexShader: earthVertex,
    fragmentShader: earthFragment,
  });

  earthMesh = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS, 128, 128),
    earthMaterial
  );
  earthGroup.add(earthMesh);

  if (cloudsTex) {
    const cloudMaterial = new THREE.ShaderMaterial({
      uniforms: {
        cloudMap:     { value: cloudsTex },
        sunDirection: { value: SUN_DIRECTION.clone() },
      },
      vertexShader: earthVertex,
      fragmentShader: cloudFragment,
      transparent: true,
      depthWrite: false,
    });
    cloudMesh = new THREE.Mesh(
      new THREE.SphereGeometry(CLOUD_RADIUS, 128, 128),
      cloudMaterial
    );
    earthGroup.add(cloudMesh);
  }

  const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      sunDirection: { value: SUN_DIRECTION.clone() },
      cameraPos:    { value: camera.position.clone() },
    },
    vertexShader: atmosphereVertex,
    fragmentShader: atmosphereFragment,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(ATMO_RADIUS, 128, 128),
    atmosphereMaterial
  );
  scene.add(atmosphere);

  // Inner atmosphere haze that hugs the surface
  const haze = new THREE.Mesh(
    new THREE.SphereGeometry(1.02, 96, 96),
    new THREE.ShaderMaterial({
      uniforms: {
        sunDirection: { value: SUN_DIRECTION.clone() },
        cameraPos:    { value: camera.position.clone() },
      },
      vertexShader: atmosphereVertex,
      fragmentShader: `
        uniform vec3 sunDirection;
        uniform vec3 cameraPos;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        void main() {
          vec3 N = normalize(vWorldNormal);
          vec3 V = normalize(cameraPos - vWorldPos);
          vec3 L = normalize(sunDirection);
          float fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.0);
          float dayMask = smoothstep(-0.2, 0.4, dot(N, L));
          gl_FragColor = vec4(vec3(0.42, 0.72, 1.0), fresnel * dayMask * 0.6);
        }
      `,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
  );
  earthGroup.add(haze);

  loading?.classList.add('hidden');
  setTimeout(() => loading?.remove(), 800);
});

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 1.35;
controls.maxDistance = 8;
controls.rotateSpeed = 0.5;
controls.zoomSpeed = 0.8;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.25;

let resumeTimer = null;
controls.addEventListener('start', () => {
  controls.autoRotate = false;
  if (resumeTimer) clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => { controls.autoRotate = true; }, 5000);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const updateCameraUniform = (mesh) => {
  if (mesh && mesh.material.uniforms && mesh.material.uniforms.cameraPos) {
    mesh.material.uniforms.cameraPos.value.copy(camera.position);
  }
};

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  if (earthMesh) earthMesh.rotation.y += dt * 0.025;
  if (cloudMesh) cloudMesh.rotation.y += dt * 0.032;
  stars.rotation.y += dt * 0.003;
  controls.update();

  scene.traverse((obj) => {
    if (obj.isMesh && obj.material && obj.material.uniforms && obj.material.uniforms.cameraPos) {
      obj.material.uniforms.cameraPos.value.copy(camera.position);
    }
  });

  renderer.render(scene, camera);
}
animate();

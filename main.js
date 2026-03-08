import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

/* =============================
   CHỈNH NỘI DUNG Ở ĐÂY
============================= */
const MORPH_TEXTS = ["Chúc các bạn nữ lớp 11/10", "Ngày quốc tế phụ nữ 8/3 ", "Dui dẻ"];

// Thư (đúng format bạn gửi)
const MESSAGE = [
    "Nhân dịp ngày quốc tế phụ nữ 8/3, tập thể các bạn nam lớp 11/10 mong muốn gửi tới những nàng công chúa của lớp những lời chúc tốt đẹp nhất. Chúng mình mong các bạn sẽ luôn giữ được nụ cười trên môi, sẽ luôn xinh đẹp rạng ngời. Chúc bạn (tên riêng) 8386, vạn sự như ý, triệu sự như mơ, tỉ sự bất ngờ và hàng giờ hạnh phúc. Cảm ơn (tên riêng) vì đã đồng hành cùng với lớp nói chung và chúng tớ nói riêng trong suốt một khoảng thời gian không dài nhưng cũng đủ để có những kỉ niệm đẹp cùng nhau. Hy vọng trong thời gian tới, như gần nhất là trại, chúng ta sẽ cùng nhau có thêm thật nhiều kỉ niệm với nhau nữa nè. Một lần nữa, chúc (tên riêng) một ngày 8/3 thật vui vẻ và hạnh phúc nhé!",
    "    Hồng Anh",
    "    Nhận nơi đây một thành viên mới",
    "    Hó hé áng mây những tiếng cười", 
    "    Ánh nắng ngày xuân như phấp phới",
    "    Phải cùng gắn kết nữa Anh ơi"

].join("\n");

const FROM_NAME = "Tập thể các bạn nam 11/10";

/* =============================
   CONFIG (giảm mật độ hạt)
============================= */
const IS_DESKTOP = window.innerWidth >= 768;
const PARTICLE_COUNT = IS_DESKTOP ? 60000 : 32000;  // ✅ giảm mật độ
const SHAPE_SIZE = IS_DESKTOP ? 22 : 14;

const HOLD_MS = 1000;
const MORPH_DURATION = 3.0; // seconds
const HOLD_BETWEEN_TEXT_MS = 1000;
const WAIT_AFTER_MORPH_MS = 650;

/* =============================
   DOM
============================= */
const loading = document.getElementById("loading");
const progressBar = document.getElementById("progressBar");

const startWrap = document.getElementById("start-wrap");
const ringFill = document.getElementById("ring-fill");

const webglCanvas = document.getElementById("webglCanvas");

// fireworks + envelope elements
const fxCanvas = document.getElementById("fx");
const fxCtx = fxCanvas.getContext("2d", { alpha: true });

const envelopeWrap = document.getElementById("envelopeWrap");
const envelope = document.getElementById("envelope");
const sealBtn = document.getElementById("sealBtn");
const bigLetter = document.getElementById("bigLetter");
const typedEl = document.getElementById("typed");
const fromNameEl = document.getElementById("fromName");
const tagEl = document.getElementById("tag");
fromNameEl.textContent = FROM_NAME;

/* =============================
   THREE GLOBALS
============================= */
let scene, camera, renderer, composer, bloomPass, controls, clock;
let particlesGeometry, particlesMaterial, particleSystem;

let particleCount = 0;
let sourcePositions = null;
let targetPositions = null;

let isMorphing = false;
let morphStartTime = 0;

let isScatterPhase = true;

// “lung tung” velocity
let vel = null;

// RAF control
let threeRafId = 0;
let threeRunning = true;





/////
const bgmEl = document.getElementById("bgm");
if (bgmEl) bgmEl.volume = 0.55;

function startBgm() {
    if (!bgmEl) return;
    bgmEl.play().catch(() => { });
}

function stopBgm() {
    if (!bgmEl) return;
    bgmEl.pause();
    bgmEl.currentTime = 0;
}

////

/* =============================
   LOADING HELPERS
============================= */
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function setProgress(p) {
    progressBar.style.width = `${clamp(p, 0, 100)}%`;
}
function hideLoadingShowHold() {
    loading.classList.add("hide");
    setTimeout(() => (loading.style.display = "none"), 520);
    startWrap.style.display = "flex";
}

/* =============================
   THREE HELPERS
============================= */
function createParticleTexture() {
    const size = 128;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.45, "rgba(255,255,255,0.9)");
    g.addColorStop(0.75, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
}

/* =============================
   TEXT -> POINTS
============================= */
function generateFromText(text, count, size) {
    if (!text || !text.trim()) return null;

    const w = 900;
    const maxLineWidth = 760;
    const fontSize = 150;
    const lineHeight = 230;

    const mctx = document.createElement("canvas").getContext("2d");
    mctx.font = `bold ${fontSize}px "Pacifico", cursive`;

    const words = text.trim().split(/\s+/);
    const lines = [];
    let line = "";
    for (const word of words) {
        const next = line ? line + " " + word : word;
        if (mctx.measureText(next).width <= maxLineWidth) line = next;
        else { if (line) lines.push(line); line = word; }
    }
    if (line) lines.push(line);

    const h = Math.max(320, lines.length * lineHeight + 80);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#fff";
    ctx.font = `bold ${fontSize}px "Pacifico", cursive`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const startY = h / 2 - (lines.length - 1) * (lineHeight / 2);
    lines.forEach((ln, i) => ctx.fillText(ln, w / 2, startY + i * lineHeight));

    const img = ctx.getImageData(0, 0, w, h).data;
    const pixels = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const b = (img[idx] + img[idx + 1] + img[idx + 2]) / 3;
        if (b > 25) pixels.push({ x, y, b, key: y * w + x });
    }
    if (!pixels.length) return null;
    pixels.sort((a, b) => a.key - b.key);

    const scale = size / Math.max(w, h);
    const cx = w / 2, cy = h / 2;
    const depthScale = size * 0.05;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        const p = pixels[Math.min(Math.floor((i * pixels.length) / count), pixels.length - 1)];
        const px = (p.x - cx) * scale;
        const py = (cy - p.y) * scale;
        const pz = (p.b / 255) * depthScale;

        positions[i * 3] = px;
        positions[i * 3 + 1] = py;
        positions[i * 3 + 2] = pz;

        const dist = Math.sqrt(px * px + py * py + pz * pz);
        const hue = THREE.MathUtils.mapLinear(dist, 0, size * 0.7, 330, 360);
        const c = new THREE.Color().setHSL(hue / 360, 0.82, 0.50);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
    }

    return { positions, colors };
}

/* =============================
   PARTICLES
============================= */
function initScatterParticles() {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 3 + Math.random() * 14;

        positions[i3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i3 + 1] = r * Math.cos(phi);
        positions[i3 + 2] = r * Math.sin(phi) * Math.sin(theta);

        const c = new THREE.Color().setHSL((330 + Math.random() * 30) / 360, 0.82, 0.50);
        colors[i3] = c.r;
        colors[i3 + 1] = c.g;
        colors[i3 + 2] = c.b;
    }

    buildParticleSystem({ positions, colors });
    isScatterPhase = true;
}

function buildParticleSystem(result) {
    particleCount = result.positions.length / 3;

    if (particleSystem) {
        scene.remove(particleSystem);
        particlesGeometry.dispose();
        particlesMaterial.dispose();
    }

    particlesGeometry = new THREE.BufferGeometry();
    particlesGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(result.positions), 3));
    particlesGeometry.setAttribute("color", new THREE.BufferAttribute(result.colors, 3));

    const sizes = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) sizes[i] = THREE.MathUtils.randFloat(0.06, 0.15);
    particlesGeometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    particlesMaterial = new THREE.ShaderMaterial({
        uniforms: { pointTexture: { value: createParticleTexture() } },
        vertexShader: `
      attribute float size;
      varying vec3 vColor;
      void main(){
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (650.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
        fragmentShader: `
      uniform sampler2D pointTexture;
      varying vec3 vColor;
      void main(){
        float a = texture2D(pointTexture, gl_PointCoord).a;
        if(a < 0.05) discard;
        gl_FragColor = vec4(vColor, a);
      }
    `,
        transparent: true,
        depthWrite: false,
        vertexColors: true,
        blending: THREE.NormalBlending
    });

    particleSystem = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particleSystem);

    // velocity để bay lung tung
    vel = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        vel[i3] = (Math.random() - 0.5) * 2.2;
        vel[i3 + 1] = (Math.random() - 0.5) * 2.2;
        vel[i3 + 2] = (Math.random() - 0.5) * 2.2;
    }

    sourcePositions = new Float32Array(particlesGeometry.attributes.position.array);
    targetPositions = null;
}

function startMorphTo(result) {
    if (!result) return;

    const count = result.positions.length / 3;
    if (count !== particleCount) {
        buildParticleSystem(result);
        return;
    }

    sourcePositions = new Float32Array(particlesGeometry.attributes.position.array);
    targetPositions = new Float32Array(result.positions);

    particlesGeometry.attributes.color.array.set(result.colors);
    particlesGeometry.attributes.color.needsUpdate = true;

    isMorphing = true;
    morphStartTime = clock.getElapsedTime();
    isScatterPhase = false;
}

/* =============================
   THREE INIT
============================= */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function initThree() {
    setProgress(6);
    await document.fonts.load('140px "Pacifico"');
    setProgress(28);

    clock = new THREE.Clock();
    scene = new THREE.Scene();
    scene.background = null; // để thấy nền body gradient
    scene.fog = new THREE.FogExp2(0x000000, 0.03);
    setProgress(42);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, IS_DESKTOP ? 6 : 8, IS_DESKTOP ? 18 : 26);
    camera.lookAt(0, 0, 0);
    setProgress(58);

    renderer = new THREE.WebGLRenderer({ canvas: webglCanvas, antialias: false, alpha: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    setProgress(74);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 5;
    controls.maxDistance = 80;

    scene.add(new THREE.AmbientLight(0x554050));
    const dir1 = new THREE.DirectionalLight(0xfff0f5, 1.25);
    dir1.position.set(15, 20, 10);
    scene.add(dir1);

    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.85, 0.55, 0.15);
    composer.addPass(bloomPass);
    setProgress(90);

    window.addEventListener("resize", onResize);
    initScatterParticles();
    setProgress(100);

    await sleep(250);
    hideLoadingShowHold();
    animateThree();
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    resizeFx();
}

/* =============================
   THREE ANIMATE
============================= */
function animateThree() {
    threeRafId = requestAnimationFrame(animateThree);
    if (!threeRunning) return;

    const t = clock.getElapsedTime();
    const dt = clamp(clock.getDelta(), 0.001, 0.033);

    controls.update();

    if (particlesGeometry && particleCount > 0) {
        const pos = particlesGeometry.attributes.position.array;

        if (isMorphing && targetPositions) {
            const k = Math.min(1, (t - morphStartTime) / MORPH_DURATION);
            const smooth = k * k * (3 - 2 * k);

            for (let i = 0; i < particleCount; i++) {
                const i3 = i * 3;
                pos[i3] = sourcePositions[i3] + (targetPositions[i3] - sourcePositions[i3]) * smooth;
                pos[i3 + 1] = sourcePositions[i3 + 1] + (targetPositions[i3 + 1] - sourcePositions[i3 + 1]) * smooth;
                pos[i3 + 2] = sourcePositions[i3 + 2] + (targetPositions[i3 + 2] - sourcePositions[i3 + 2]) * smooth;
            }
            particlesGeometry.attributes.position.needsUpdate = true;

            if (k >= 1) {
                isMorphing = false;
                sourcePositions = new Float32Array(targetPositions);
            }
        } else if (isScatterPhase && vel) {
            // bay lung tung (kéo nhẹ về tâm + giới hạn radius)
            const pull = 0.12;
            const jitter = 0.85;
            const maxR = 18;

            for (let i = 0; i < particleCount; i++) {
                const i3 = i * 3;

                vel[i3] += (Math.sin(t * 1.1 + i * 0.0007) * 0.6 + (Math.random() - 0.5) * jitter) * dt;
                vel[i3 + 1] += (Math.cos(t * 1.0 + i * 0.0009) * 0.6 + (Math.random() - 0.5) * jitter) * dt;
                vel[i3 + 2] += (Math.sin(t * 0.9 + i * 0.0011) * 0.6 + (Math.random() - 0.5) * jitter) * dt;

                vel[i3] += (-pos[i3]) * pull * dt;
                vel[i3 + 1] += (-pos[i3 + 1]) * pull * dt;
                vel[i3 + 2] += (-pos[i3 + 2]) * pull * dt;

                pos[i3] += vel[i3] * dt;
                pos[i3 + 1] += vel[i3 + 1] * dt;
                pos[i3 + 2] += vel[i3 + 2] * dt;

                const r = Math.hypot(pos[i3], pos[i3 + 1], pos[i3 + 2]);
                if (r > maxR) {
                    const s = maxR / r;
                    pos[i3] *= s; pos[i3 + 1] *= s; pos[i3 + 2] *= s;
                    vel[i3] *= -0.55; vel[i3 + 1] *= -0.55; vel[i3 + 2] *= -0.55;
                }
            }
            particlesGeometry.attributes.position.needsUpdate = true;
        }
    }

    composer.render(dt);
}

/* =============================
   HOLD → START
============================= */
let holdTimer = null;
let holdStart = 0;
let triggered = false;

function resetHoldUI() {
    startWrap.classList.remove("held");
    ringFill.style.transition = "stroke-dashoffset 0.25s ease";
    ringFill.style.strokeDashoffset = "188.5";
}

function onHoldDown(e) {
    e.preventDefault();
    if (triggered) return;
    startBgm();

    holdStart = Date.now();
    ringFill.style.transition = `stroke-dashoffset ${HOLD_MS}ms linear`;
    ringFill.style.strokeDashoffset = "0";

    holdTimer = setInterval(() => {
        const elapsed = Date.now() - holdStart;
        if (elapsed >= 450) startWrap.classList.add("held");
        if (elapsed >= HOLD_MS) {
            clearInterval(holdTimer);
            holdTimer = null;
            triggered = true;
            startWrap.style.display = "none";
            startMorphSequence();
        }
    }, 50);
}

function onHoldUp() {
    if (triggered) return;
    if (holdTimer) clearInterval(holdTimer);
    holdTimer = null;
    if (!triggered) stopBgm();
    resetHoldUI();
}

startWrap.addEventListener("pointerdown", onHoldDown);
startWrap.addEventListener("pointerup", onHoldUp);
startWrap.addEventListener("pointercancel", onHoldUp);
startWrap.addEventListener("pointerleave", onHoldUp);

/* =============================
   MORPH → CLEAR → FIREWORKS + ENVELOPE
============================= */
async function startMorphSequence() {
    isScatterPhase = false;

    for (const text of MORPH_TEXTS) {
        const result = generateFromText(text, PARTICLE_COUNT, SHAPE_SIZE);
        startMorphTo(result);
        await sleep(MORPH_DURATION * 1000 + HOLD_BETWEEN_TEXT_MS);
    }

    await sleep(WAIT_AFTER_MORPH_MS);

    // ✅ dọn sạch particles + dừng three loop
    clearAllParticles();

    // ✅ bắt đầu pháo hoa + phong bì (theo code bạn đưa)
    startFireworksSequence();
}

function clearAllParticles() {
    if (particleSystem) {
        scene.remove(particleSystem);
        particleSystem = null;
    }
    if (particlesGeometry) {
        particlesGeometry.dispose();
        particlesGeometry = null;
    }
    if (particlesMaterial) {
        particlesMaterial.dispose();
        particlesMaterial = null;
    }
    particleCount = 0;
    sourcePositions = null;
    targetPositions = null;
    vel = null;

    webglCanvas.style.opacity = "0";
    setTimeout(() => {
        threeRunning = false;
        cancelAnimationFrame(threeRafId);
    }, 480);
}

/* =============================
   FIREWORKS + ENVELOPE (adapt từ code bạn gửi)
============================= */
function rand(a, b) { return a + Math.random() * (b - a); }

function resizeFx() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    fxCanvas.width = Math.floor(innerWidth * dpr);
    fxCanvas.height = Math.floor(innerHeight * dpr);
    fxCanvas.style.width = innerWidth + "px";
    fxCanvas.style.height = innerHeight + "px";
    fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

const fw = [];
const sparks = [];
let fireworksPhase = false;
let fxStarted = false;
let fxLast = performance.now();

function launchFirework() {
    const x = rand(innerWidth * 0.15, innerWidth * 0.85);
    const y = innerHeight + 20;
    const tx = x + rand(-60, 60);
    const ty = rand(innerHeight * 0.18, innerHeight * 0.45);
    fw.push({ x, y, vx: (tx - x) / rand(28, 40), vy: (ty - y) / rand(28, 40), life: 0, ttl: rand(28, 40) });
}

function explode(x, y) {
    const count = Math.floor(rand(45, 80));
    for (let i = 0; i < count; i++) {
        const a = rand(0, Math.PI * 2);
        const sp = rand(1.8, 4.2);
        sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: rand(0.03, 0.06), life: 0, ttl: rand(48, 78), hue: rand(320, 360) });
    }
}

function tickFx(now) {
    const dt = Math.min(33, now - fxLast);
    fxLast = now;

    fxCtx.fillStyle = "rgba(0,0,0,0.18)";
    fxCtx.fillRect(0, 0, innerWidth, innerHeight);

    if (fireworksPhase) {
        if (Math.random() < 0.085) launchFirework();

        for (let i = fw.length - 1; i >= 0; i--) {
            const f = fw[i];
            f.x += f.vx; f.y += f.vy; f.life++;
            fxCtx.beginPath();
            fxCtx.globalAlpha = 0.9;
            fxCtx.fillStyle = "rgba(255,160,210,0.9)";
            fxCtx.arc(f.x, f.y, 2.2, 0, Math.PI * 2);
            fxCtx.fill();
            fxCtx.globalAlpha = 1;

            if (f.life >= f.ttl) { explode(f.x, f.y); fw.splice(i, 1); }
        }

        for (let i = sparks.length - 1; i >= 0; i--) {
            const p = sparks[i];
            p.vy += p.g; p.x += p.vx; p.y += p.vy; p.life++;
            const t = p.life / p.ttl;
            fxCtx.beginPath();
            fxCtx.globalAlpha = (1 - t);
            fxCtx.fillStyle = `hsla(${p.hue}, 90%, ${60 + 20 * (1 - t)}%, 1)`;
            fxCtx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
            fxCtx.fill();
            fxCtx.globalAlpha = 1;

            if (p.life >= p.ttl) sparks.splice(i, 1);
        }
    } else {
        // fade sparks còn lại
        for (let i = sparks.length - 1; i >= 0; i--) {
            const p = sparks[i];
            p.vy += p.g; p.x += p.vx; p.y += p.vy; p.life++;
            const t = p.life / p.ttl;
            fxCtx.beginPath();
            fxCtx.globalAlpha = (1 - t) * 0.7;
            fxCtx.fillStyle = `hsla(${p.hue}, 90%, 70%, 1)`;
            fxCtx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
            fxCtx.fill();
            fxCtx.globalAlpha = 1;
            if (p.life >= p.ttl) sparks.splice(i, 1);
        }
    }

    requestAnimationFrame(tickFx);
}

function startFireworksSequence() {
    if (fxStarted) return;
    fxStarted = true;

    fxCanvas.style.display = "block";
    resizeFx();
    window.addEventListener("resize", resizeFx, { passive: true });

    fireworksPhase = true;
    requestAnimationFrame(tickFx);

    // Sau pháo hoa -> hiện phong bì
    setTimeout(() => {
        fireworksPhase = false;
        envelopeWrap.classList.add("show");
    }, 4000);
}

/* =============================
   OPEN ENVELOPE → SHOW BIG LETTER + TYPEWRITER
============================= */
let opened = false;

function typewriter(text, speed = 26) {
    typedEl.textContent = "";
    let i = 0;
    const step = () => {
        if (i <= text.length) {
            typedEl.textContent = text.slice(0, i);
            i++;
            const paper = document.getElementById("paper");
            paper.scrollTop = paper.scrollHeight;
            setTimeout(step, speed);
        }
    };
    step();
}

function openEnvelope() {
    if (opened) return;
    opened = true;

    envelopeWrap.classList.add("opened");
    envelope.classList.add("opened");
    tagEl.textContent = "Đang mở thiệp...";

    setTimeout(() => {
        envelopeWrap.classList.add("fade-out");
        setTimeout(() => {
            bigLetter.classList.add("show");
            setTimeout(() => typewriter(MESSAGE, 26), 400);
        }, 650);
    }, 900);
}

sealBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openEnvelope();
});

/* =============================
   BOOT
============================= */
initThree();
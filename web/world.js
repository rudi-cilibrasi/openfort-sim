import * as THREE from "three";

const COLORS = {
  grass: 0x7db653,
  sand: 0xd6c597,
  stone: 0xc3c7b3,
  cyan: 0x54d4db,
  coral: 0xe4876a,
  wood: 0xa77b4e,
  violet: 0x9c83ed,
  white: 0xe6eee7,
};
const color = (value) =>
  COLORS[value] ??
  (/^#[0-9a-f]{6}$/i.test(value)
    ? Number.parseInt(value.slice(1), 16)
    : COLORS.stone);
const geometryCache = new Map();
function geom(type, ...sizes) {
  const key = type + sizes.join(",");
  if (!geometryCache.has(key))
    geometryCache.set(key, new THREE[type](...sizes));
  return geometryCache.get(key);
}
function mesh(type, sizes, tint, roughness = 0.85) {
  const obj = new THREE.Mesh(
    geom(type, ...sizes),
    new THREE.MeshStandardMaterial({
      color: tint,
      roughness,
      flatShading: true,
    }),
  );
  obj.castShadow = true;
  obj.receiveShadow = true;
  return obj;
}
function box(w, h, d, tint, x = 0, y = 0, z = 0) {
  const m = mesh("BoxGeometry", [w, h, d], tint);
  m.position.set(x, y, z);
  return m;
}
function tree(scale = 1) {
  const g = new THREE.Group();
  g.add(box(0.35, 2.1, 0.35, 0x785e40, 0, 1, 0));
  for (let i = 0; i < 3; i++) {
    const m = mesh(
      "ConeGeometry",
      [1.8 - i * 0.36, 2.4, 5],
      [0x3e8058, 0x4e9961, 0x65a96b][i],
    );
    m.position.y = 2.4 + i * 0.9;
    g.add(m);
  }
  g.scale.setScalar(scale);
  return g;
}
function character(tint = 0x61c6d4) {
  const g = new THREE.Group();
  const body = box(0.58, 0.65, 0.32, tint, 0, 1.1, 0);
  g.add(body);
  g.add(box(0.39, 0.39, 0.39, 0xe3b787, 0, 1.65, 0));
  g.add(box(0.46, 0.18, 0.44, 0x283b52, 0, 1.85, 0));
  g.add(box(0.32, 0.12, 0.025, 0x66e1ef, 0, 1.66, -0.21));
  g.add(box(0.37, 0.42, 0.2, 0x384b5d, 0, 1.2, 0.26));
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = box(0.21, 0.64, 0.25, 0x293c50, s * 0.16, 0.37, 0);
    legs.push(leg);
    g.add(leg);
    g.add(box(0.2, 0.52, 0.22, tint, s * 0.39, 1.1, 0));
  }
  g.add(box(0.15, 0.13, 0.7, 0x334253, 0.42, 1, -0.42));
  g.userData.legs = legs;
  return g;
}
function label(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 100;
  const c = canvas.getContext("2d");
  c.fillStyle = "#152b3bd9";
  c.beginPath();
  c.roundRect(0, 5, 512, 85, 20);
  c.fill();
  c.fillStyle = "#ffffff";
  c.font = "bold 28px system-ui";
  c.textAlign = "center";
  c.fillText(text.slice(0, 30), 256, 60);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false }),
  );
  s.scale.set(2.6, 0.51, 1);
  return s;
}

export class World {
  constructor(container, callbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.objects = new Map();
    this.keys = new Set();
    this.ready = false;
    this.score = 0;
    this.inspect = false;
    this.active = true;
    this.yaw = 0;
    this.pitch = 0.32;
    this.distance = 5.6;
    this.velocity = 0;
    this.pos = new THREE.Vector3(0, 0, 13);
    this.eventPending = new Set();
    this.inside = new Set();
    this.elapsed = 0;
    this.renderedFrames = 0;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xaad3df);
    this.scene.fog = new THREE.Fog(0xaad3df, 42, 145);
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 250);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    container.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xd5efff, 0x738f50, 2.7));
    const sun = new THREE.DirectionalLight(0xffefcf, 3.1);
    sun.position.set(-20, 35, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -35;
    sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 35;
    sun.shadow.camera.bottom = -35;
    sun.shadow.normalBias = 0.04;
    sun.shadow.bias = -0.0001;
    this.scene.add(sun);
    this.environment();
    this.mapGroup = new THREE.Group();
    this.scene.add(this.mapGroup);
    this.player = character();
    this.scene.add(this.player);
    this.effects = [];
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.input();
    this.last = performance.now();
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }
  environment() {
    const sea = mesh("PlaneGeometry", [1000, 1000], 0x65b8cd, 0.35);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -2;
    sea.receiveShadow = false;
    this.scene.add(sea);
    const base = mesh("CylinderGeometry", [42, 36, 7, 12], 0x7d8c68);
    base.position.y = -3.7;
    base.rotation.y = 0.2;
    this.scene.add(base);
    const ground = mesh("CylinderGeometry", [41.8, 42, 1, 12], 0x88b961);
    ground.position.y = -0.5;
    ground.rotation.y = 0.2;
    this.scene.add(ground);
    const beach = mesh("CylinderGeometry", [44, 43, 1, 12], 0xdacb9d);
    beach.position.y = -1.25;
    beach.rotation.y = 0.2;
    this.scene.add(beach);
    for (let i = 0; i < 46; i++) {
      const a = i * 2.39996;
      const r = 19 + (i % 6) * 3.1;
      const t = tree(0.65 + (i % 4) * 0.22);
      t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      t.rotation.y = a;
      this.scene.add(t);
    }
    for (let i = 0; i < 14; i++) {
      const a = i * 1.9;
      const r = 22 + (i % 3) * 5;
      const rock = mesh(
        "DodecahedronGeometry",
        [1 + (i % 3) * 0.5, 0],
        0xa0ac8d,
      );
      rock.scale.y = 0.65;
      rock.position.set(Math.cos(a) * r, 0.3, Math.sin(a) * r);
      this.scene.add(rock);
    }
    for (let i = 0; i < 8; i++) {
      const mount = mesh(
        "ConeGeometry",
        [12 + (i % 4) * 3, 12 + (i % 3) * 6, 5],
        0x819f9a,
      );
      const a = i * 0.9;
      mount.position.set(Math.cos(a) * 100, -2, Math.sin(a) * 100);
      this.scene.add(mount);
    }
    this.clouds = [];
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const m = mesh("IcosahedronGeometry", [2.6 + j * 0.4, 0], 0xf1f3e8);
        m.castShadow = false;
        m.scale.y = 0.45;
        m.position.set(j * 3.2, Math.sin(j) * 0.4, 0);
        g.add(m);
      }
      g.position.set(
        (i % 4) * 40 - 70,
        24 + (i % 3) * 6,
        Math.floor(i / 4) * 65 - 90,
      );
      this.clouds.push(g);
      this.scene.add(g);
    }
  }
  input() {
    const el = this.container;
    let drag = null;
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      el.focus({ preventScroll: true });
      drag = { x: e.clientX, y: e.clientY, moved: 0 };
      el.setPointerCapture(e.pointerId);
      this.callbacks.focus?.();
    });
    el.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      this.yaw -= dx * 0.006;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.004, -0.08, 1);
      drag.x = e.clientX;
      drag.y = e.clientY;
    });
    el.addEventListener("pointerup", (e) => {
      if (drag && drag.moved < 5) {
        if (this.inspect) this.pick(e);
        else this.shoot(e);
      }
      drag = null;
    });
    el.addEventListener("pointercancel", () => (drag = null));
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.distance = THREE.MathUtils.clamp(
          this.distance + e.deltaY * 0.008,
          2.5,
          11,
        );
      },
      { passive: false },
    );
    window.addEventListener("keydown", (e) => {
      if (document.activeElement !== el) return;
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "Space",
          "ShiftLeft",
          "ShiftRight",
          "KeyE",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
        ].includes(e.code)
      ) {
        e.preventDefault();
        this.keys.add(e.code);
        if (e.code === "KeyE" && !e.repeat) this.interact();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
    el.addEventListener("blur", () => this.keys.clear());
  }
  resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
  clear() {
    for (const obj of this.objects.values()) {
      obj.group.traverse((m) => {
        if (m.material?.map) m.material.map.dispose();
        m.material?.dispose?.();
      });
    }
    this.mapGroup.clear();
    this.objects.clear();
    this.inside.clear();
    this.eventPending.clear();
    this.score = 0;
    this.velocity = 0;
    this.yaw = 0;
    this.pitch = 0.32;
    this.pos.set(0, 0, 13);
    this.spawn = this.pos.clone();
    this.nearest = null;
    this.callbacks.interaction?.(null);
    this.ready = true;
  }
  makeObject(
    kind,
    id,
    x,
    y,
    z,
    w = 1,
    d = 1,
    h = 1,
    tint = "stone",
    text = "",
  ) {
    if (this.objects.has(id)) throw new Error(`Duplicate object ID: ${id}`);
    const g = new THREE.Group();
    const c = color(tint);
    let collider = [
      "floor",
      "wall",
      "crate",
      "house",
      "tower",
      "ramp",
    ].includes(kind);
    if (kind === "rock") {
      const rock = mesh("DodecahedronGeometry", [0.5, 0], c);
      rock.scale.set(w, h, d);
      rock.position.y = h / 2;
      g.add(rock);
      collider = false;
    } else if (kind === "tree") {
      g.add(tree(h / 5.8));
      collider = false;
    } else if (kind === "house") {
      g.add(box(w, h * 0.72, d, c, 0, h * 0.36, 0));
      const roof = mesh("ConeGeometry", [w * 0.81, h * 0.42, 4], 0x6b7483);
      roof.rotation.y = Math.PI / 4;
      roof.scale.z = d / w;
      roof.position.y = h * 0.84;
      g.add(roof);
      g.add(box(w * 0.2, h * 0.38, 0.04, 0x4c626b, 0, h * 0.19, d / 2 + 0.03));
      for (const s of [-1, 1])
        g.add(
          box(
            w * 0.17,
            h * 0.16,
            0.05,
            0x93d9d8,
            s * w * 0.29,
            h * 0.43,
            d / 2 + 0.04,
          ),
        );
    } else if (kind === "tower") {
      g.add(box(w * 0.9, h * 0.85, d * 0.9, c, 0, h * 0.425, 0));
      g.add(box(w, h * 0.1, d, c, 0, h * 0.9, 0));
      for (let i = 0; i < 4; i++) {
        g.add(
          box(
            w * 0.2,
            h * 0.13,
            d * 0.22,
            c,
            (i % 2 ? 1 : -1) * w * 0.38,
            h,
            (i < 2 ? 1 : -1) * d * 0.38,
          ),
        );
      }
      g.add(
        box(w * 0.12, h * 0.17, 0.03, 0x5b7781, 0, h * 0.63, d * 0.45 + 0.02),
      );
    } else if (kind === "crate") {
      g.add(box(w, h, d, c, 0, h / 2, 0));
      for (const side of [-1, 1]) {
        g.add(
          box(
            w * 0.08,
            h * 0.92,
            d * 1.015,
            0x745c42,
            side * w * 0.36,
            h / 2,
            0,
          ),
        );
        g.add(
          box(
            w * 1.015,
            h * 0.08,
            d * 1.015,
            0x745c42,
            0,
            h * (side > 0 ? 0.85 : 0.15),
            0,
          ),
        );
      }
    } else if (kind === "target") {
      g.add(box(0.13, h * 0.65, 0.13, 0x685442, 0, h * 0.325, 0));
      const disk = mesh(
        "CylinderGeometry",
        [w * 0.7, w * 0.7, 0.14, 24],
        0xf2e5bb,
      );
      disk.rotation.x = Math.PI / 2;
      disk.position.y = h * 0.78;
      g.add(disk);
      for (let i = 0; i < 3; i++) {
        const ring = mesh(
          "TorusGeometry",
          [w * (0.18 + i * 0.17), w * 0.055, 5, 24],
          i % 2 ? 0xf2e5bb : 0xdf7557,
        );
        ring.position.set(0, h * 0.78, 0.09);
        g.add(ring);
      }
      collider = false;
    } else if (kind === "button") {
      g.add(box(0.65, 0.5, 0.65, 0x526c6d, 0, 0.25, 0));
      g.add(box(0.45, 0.55, 0.34, 0x344a5b, 0, 0.76, 0));
      const b = mesh("CylinderGeometry", [0.2, 0.2, 0.12, 12], 0xffc36a);
      b.rotation.x = Math.PI / 2;
      b.position.set(0, 0.85, 0.23);
      b.material.emissive.set(0xa46b23);
      b.material.emissiveIntensity = 0.4;
      g.add(b);
      const l = label(text);
      l.position.y = 1.7;
      g.add(l);
      collider = false;
    } else if (kind === "trigger") {
      const ring = mesh("TorusGeometry", [w, 0.09, 6, 56], 0xae87ef);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.08;
      ring.material.emissive.set(0x7d4bd1);
      ring.material.emissiveIntensity = 0.8;
      g.add(ring);
      const disk = mesh("CircleGeometry", [w, 48], 0xb3a0f7);
      disk.rotation.x = -Math.PI / 2;
      disk.position.y = 0.035;
      disk.material.transparent = true;
      disk.material.opacity = 0.2;
      g.add(disk);
      collider = false;
    } else if (kind === "pickup") {
      const gem = mesh("OctahedronGeometry", [0.4, 0], 0xcafa66);
      gem.material.emissive.set(0x8dae2e);
      gem.material.emissiveIntensity = 0.5;
      g.add(gem);
      const ring = mesh("TorusGeometry", [0.55, 0.025, 5, 24], 0xe3ff9c);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      collider = false;
    } else if (kind === "bot") {
      const body = character(tint === "wander" ? 0xe2a869 : 0xa390dc);
      g.add(body);
      const l = label(id + " · BOT");
      l.position.y = 2.3;
      g.add(l);
      collider = false;
    } else if (kind === "ramp") {
      // A wedge whose top rises toward -Y (the forward direction).
      const geo = new THREE.BufferGeometry();
      const a = [
        -w / 2,
        0,
        d / 2,
        w / 2,
        0,
        d / 2,
        -w / 2,
        h,
        -d / 2,
        w / 2,
        0,
        d / 2,
        w / 2,
        h,
        -d / 2,
        -w / 2,
        h,
        -d / 2,
        -w / 2,
        0,
        -d / 2,
        w / 2,
        0,
        -d / 2,
        w / 2,
        h,
        -d / 2,
        -w / 2,
        0,
        -d / 2,
        w / 2,
        h,
        -d / 2,
        -w / 2,
        h,
        -d / 2,
        -w / 2,
        0,
        d / 2,
        -w / 2,
        0,
        -d / 2,
        -w / 2,
        h,
        -d / 2,
        w / 2,
        0,
        d / 2,
        w / 2,
        h,
        -d / 2,
        w / 2,
        0,
        -d / 2,
      ];
      geo.setAttribute("position", new THREE.Float32BufferAttribute(a, 3));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: c,
          side: THREE.DoubleSide,
          flatShading: true,
        }),
      );
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    } else {
      g.add(box(w, h, d, c, 0, h / 2, 0));
      if (kind === "floor") {
        g.add(box(w, 0.035, d, 0xffffff, 0, h + 0.015, 0));
        g.children.at(-1).material.transparent = true;
        g.children.at(-1).material.opacity = 0.13;
      }
    }
    g.position.set(x, z, y);
    g.userData.id = id;
    this.mapGroup.add(g);
    const obj = {
      id,
      kind,
      group: g,
      w,
      d,
      h,
      collider,
      home: new THREE.Vector3(x, z, y),
      radius: w,
      label: text,
      behavior: tint,
      baseZ: z,
    };
    this.objects.set(id, obj);
    return obj;
  }
  apply(command) {
    const [op, ...v] = command;
    const n = (i) => Number(v[i]) / 100;
    const pos = (id) => this.objects.get(id);
    switch (op) {
      case "world":
        this.callbacks.name?.(v[0]);
        break;
      case "spawn":
        this.pos.set(n(0), n(2), n(1));
        this.spawn = this.pos.clone();
        this.camera.position
          .copy(this.pos)
          .add(
            new THREE.Vector3(
              0,
              2.6 + Math.sin(this.pitch) * this.distance,
              this.distance,
            ),
          );
        this.camera.lookAt(
          this.pos
            .clone()
            .add(new THREE.Vector3(0, 1.5 - this.pitch * 0.5, -1.7)),
        );
        this.camera.updateMatrixWorld();
        break;
      case "prop":
        this.makeObject(v[1], v[0], n(2), n(3), n(4), n(5), n(6), n(7), v[8]);
        break;
      case "button":
        this.makeObject(
          "button",
          v[0],
          n(1),
          n(2),
          n(3),
          1,
          1,
          1,
          "stone",
          v[4],
        );
        break;
      case "trigger":
        this.makeObject("trigger", v[0], n(1), n(2), n(3), n(4));
        break;
      case "pickup":
        this.makeObject("pickup", v[0], n(1), n(2), n(3));
        break;
      case "bot":
        this.makeObject("bot", v[0], n(1), n(2), n(3), 1, 1, 2, v[4]);
        break;
      case "hide":
        if (pos(v[0])) pos(v[0]).group.visible = false;
        break;
      case "show":
        if (pos(v[0])) pos(v[0]).group.visible = true;
        break;
      case "move": {
        const o = pos(v[0]);
        if (o) {
          o.motion = {
            from: o.group.position.clone(),
            to: new THREE.Vector3(n(1), n(3), n(2)),
            start: this.elapsed,
            duration: Math.max(0.01, Number(v[4]) / 1000),
          };
        }
        break;
      }
      case "color":
        pos(v[0])?.group.traverse((m) => {
          if (m.isMesh) m.material.color.setHex(color(v[1]));
        });
        break;
      case "score":
        this.score += Number(v[0]);
        this.callbacks.score?.(this.score);
        break;
      case "message":
        this.callbacks.message?.(v[0]);
        break;
      case "teleport":
        this.pos.set(n(0), n(2), n(1));
        this.velocity = 0;
        break;
      case "launch":
        this.velocity = n(0);
        break;
      case "finish":
        this.callbacks.finish?.(v[0]);
        break;
    }
  }
  floorAt(o, x, z) {
    if (o.kind === "ramp")
      return (
        o.group.position.y +
        o.h *
          THREE.MathUtils.clamp((o.group.position.z + o.d / 2 - z) / o.d, 0, 1)
      );
    return o.group.position.y + o.h;
  }
  updatePlayer(dt) {
    const input = new THREE.Vector3();
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) input.z -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) input.z += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) input.x -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) input.x += 1;
    input.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const speed =
      this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? 8 : 5.4;
    let floor = 0;
    for (const o of this.objects.values()) {
      if (!o.collider || !o.group.visible) continue;
      const p = o.group.position;
      const inBounds =
        Math.abs(this.pos.x - p.x) < o.w / 2 + 0.27 &&
        Math.abs(this.pos.z - p.z) < o.d / 2 + 0.27;
      const top = this.floorAt(o, this.pos.x, this.pos.z);
      if (inBounds && this.pos.y >= top - 0.25 && top > floor) floor = top;
    }
    this.grounded = this.pos.y <= floor + 0.05 && this.velocity <= 0;
    if (this.keys.has("Space") && this.grounded) {
      this.velocity = 7.4;
      this.grounded = false;
    }
    if (this.grounded) {
      this.pos.y = floor;
      this.velocity = 0;
    } else this.velocity -= 19 * dt;
    const previousY = this.pos.y;
    this.pos.y += this.velocity * dt;
    const dx = input.x * speed * dt,
      dz = input.z * speed * dt;
    const blocked = (x, z) => {
      for (const o of this.objects.values()) {
        if (!o.collider || !o.group.visible) continue;
        const p = o.group.position;
        const top = this.floorAt(o, x, z);
        if (
          Math.abs(x - p.x) < o.w / 2 + 0.29 &&
          Math.abs(z - p.z) < o.d / 2 + 0.29 &&
          this.pos.y + 0.4 < top &&
          this.pos.y + 1.65 > p.y + 0.05
        ) {
          if (o.kind === "ramp" && top - this.pos.y < 0.65) {
            this.pos.y = top;
            continue;
          }
          return true;
        }
      }
      return false;
    };
    if (!blocked(this.pos.x + dx, this.pos.z)) this.pos.x += dx;
    if (!blocked(this.pos.x, this.pos.z + dz)) this.pos.z += dz;
    if (this.velocity <= 0) {
      let landing = 0;
      for (const o of this.objects.values()) {
        if (!o.collider || !o.group.visible) continue;
        const p = o.group.position,
          top = this.floorAt(o, this.pos.x, this.pos.z);
        if (
          Math.abs(this.pos.x - p.x) < o.w / 2 + 0.25 &&
          Math.abs(this.pos.z - p.z) < o.d / 2 + 0.25 &&
          previousY >= top - 0.16 &&
          this.pos.y <= top
        )
          landing = Math.max(landing, top);
      }
      if (this.pos.y < landing) {
        this.pos.y = landing;
        this.velocity = 0;
        this.grounded = true;
      }
    }
    if (
      this.pos.length() > 65 ||
      Math.abs(this.pos.x) > 38 ||
      Math.abs(this.pos.z) > 38
    ) {
      this.pos.copy(this.spawn ?? new THREE.Vector3(0, 0, 13));
      this.velocity = 0;
      this.callbacks.message?.("Back on the island. Keep experimenting.");
    }
    this.player.position.copy(this.pos);
    if (input.lengthSq() > 0.1)
      this.player.rotation.y = Math.atan2(input.x, input.z) + Math.PI;
    else this.player.rotation.y = this.yaw;
    this.player.userData.legs.forEach(
      (leg, i) =>
        (leg.rotation.x =
          input.lengthSq() > 0.1
            ? Math.sin(this.elapsed * 12 + i * Math.PI) * 0.55
            : 0),
    );
    const target = this.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
    const cameraPosition = target
      .clone()
      .add(
        new THREE.Vector3(
          Math.sin(this.yaw) * this.distance,
          1.1 + Math.sin(this.pitch) * this.distance,
          Math.cos(this.yaw) * this.distance,
        ),
      );
    // Pull the third-person camera in when a solid object is behind the player.
    const delta = cameraPosition.clone().sub(target);
    const ray = new THREE.Raycaster(
      target,
      delta.clone().normalize(),
      0.1,
      delta.length(),
    );
    const solids = [...this.objects.values()]
      .filter((o) => o.collider && o.group.visible)
      .map((o) => o.group);
    const hits = ray.intersectObjects(solids, true);
    if (hits.length)
      cameraPosition
        .copy(target)
        .addScaledVector(
          delta.normalize(),
          Math.max(0.8, hits[0].distance - 0.2),
        );
    this.camera.position.lerp(cameraPosition, 1 - Math.exp(-14 * dt));
    this.camera.lookAt(
      target
        .clone()
        .add(
          new THREE.Vector3(
            -Math.sin(this.yaw) * 1.7,
            -this.pitch * 0.5,
            -Math.cos(this.yaw) * 1.7,
          ),
        ),
    );
  }
  updateDevices(dt) {
    let nearest = null,
      dist = 2.65;
    for (const o of this.objects.values()) {
      if (!o.group.visible) continue;
      const p = o.group.position;
      if (o.motion) {
        const t = THREE.MathUtils.clamp(
          (this.elapsed - o.motion.start) / o.motion.duration,
          0,
          1,
        );
        p.lerpVectors(o.motion.from, o.motion.to, t * t * (3 - 2 * t));
        if (t === 1) {
          o.home.copy(p);
          delete o.motion;
        }
      }
      if (o.kind === "bot" && o.behavior !== "idle") {
        const r = o.behavior === "wander" ? 2.1 : 3.5;
        const t =
          this.elapsed * (o.behavior === "wander" ? 0.4 : 0.6) + o.home.x;
        p.x = o.home.x + Math.sin(t) * r;
        p.z = o.home.z + Math.cos(t) * r * 0.45;
        o.group.children[0].rotation.y =
          Math.atan2(Math.cos(t), -Math.sin(t) * 0.45) + Math.PI;
        o.group.children[0].userData.legs.forEach(
          (l, i) =>
            (l.rotation.x = Math.sin(this.elapsed * 9 + i * Math.PI) * 0.4),
        );
      }
      if (o.kind === "pickup") {
        o.group.rotation.y += dt * 0.9;
        o.group.position.y = o.home.y + Math.sin(this.elapsed * 2) * 0.12;
      }
      const horizontal = Math.hypot(this.pos.x - p.x, this.pos.z - p.z);
      const vertical = Math.abs(this.pos.y - p.y);
      if (o.kind === "button" && horizontal < dist && vertical < 2.5) {
        nearest = o;
        dist = horizontal;
      }
      if (o.kind === "trigger") {
        const inside = horizontal < o.radius && vertical < 2.1;
        if (inside && !this.inside.has(o.id)) {
          this.inside.add(o.id);
          this.send(`enter:${o.id}`);
        } else if (!inside && this.inside.has(o.id)) {
          this.inside.delete(o.id);
          this.send(`exit:${o.id}`);
        }
      }
      if (
        o.kind === "pickup" &&
        horizontal < 1 &&
        Math.abs(this.pos.y + 1 - p.y) < 1.4 &&
        !this.eventPending.has("collect:" + o.id)
      ) {
        this.eventPending.add("collect:" + o.id);
        this.send("collect:" + o.id);
      }
    }
    this.nearest = nearest;
    this.callbacks.interaction?.(nearest?.label ?? null);
  }
  send(event) {
    if (this.ready) this.callbacks.event?.(event);
  }
  interact() {
    if (this.nearest) this.send("interact:" + this.nearest.id);
    else this.callbacks.message?.("Move close to a button to interact.");
  }
  rayAt(e) {
    const r = this.container.getBoundingClientRect();
    const xy = new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(xy, this.camera);
    return ray;
  }
  hitObject(e) {
    const hits = this.rayAt(e).intersectObjects(
      [...this.objects.values()]
        .filter((o) => o.group.visible)
        .map((o) => o.group),
      true,
    );
    for (const hit of hits) {
      let node = hit.object;
      while (node && !node.userData.id) node = node.parent;
      if (node?.userData.id)
        return { obj: this.objects.get(node.userData.id), point: hit.point };
    }
    return null;
  }
  pick(e) {
    const hit = this.hitObject(e);
    if (hit) this.callbacks.inspect?.(hit.obj.id, hit.obj.kind);
  }
  shoot(e) {
    if (!this.ready) return;
    const hit = this.hitObject(e);
    const point = hit?.point ?? this.rayAt(e).ray.at(35, new THREE.Vector3());
    const from = this.pos.clone().add(new THREE.Vector3(0.4, 1.2, 0));
    const geo = new THREE.BufferGeometry().setFromPoints([from, point]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        color: 0xfff2aa,
        transparent: true,
        opacity: 0.9,
      }),
    );
    this.scene.add(line);
    this.effects.push({ line, ttl: 0.1 });
    if (hit && ["target", "bot"].includes(hit.obj.kind)) {
      this.send("hit:" + hit.obj.id);
      hit.obj.group.scale.setScalar(1.09);
      setTimeout(() => hit.obj.group.scale.setScalar(1), 100);
    }
  }
  drawMinimap() {
    const canvas = document.querySelector("#minimap"),
      c = canvas.getContext("2d");
    const scale = 1.55,
      center = 65;
    c.fillStyle = "#489eb6";
    c.fillRect(0, 0, 130, 130);
    c.fillStyle = "#b9c58e";
    c.beginPath();
    c.arc(65, 65, 62, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#739e64";
    c.beginPath();
    c.arc(65, 65, 59, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#ffffff14";
    for (let i = 0; i < 130; i += 20) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i, 130);
      c.moveTo(0, i);
      c.lineTo(130, i);
      c.stroke();
    }
    for (const o of this.objects.values()) {
      if (!o.group.visible) continue;
      const x = center + o.group.position.x * scale,
        z = center + o.group.position.z * scale;
      c.fillStyle =
        o.kind === "bot"
          ? "#e3a8ff"
          : o.kind === "trigger"
            ? "#c5a9ff"
            : o.kind === "button"
              ? "#ffe18c"
              : "#e0debd";
      c.fillRect(
        x - Math.max(1, (o.w * scale) / 2),
        z - Math.max(1, (o.d * scale) / 2),
        Math.max(3, o.w * scale),
        Math.max(3, o.d * scale),
      );
    }
    c.save();
    c.translate(center + this.pos.x * scale, center + this.pos.z * scale);
    c.rotate(-this.yaw);
    c.fillStyle = "#fff";
    c.beginPath();
    c.moveTo(0, -5);
    c.lineTo(4, 4);
    c.lineTo(0, 2);
    c.lineTo(-4, 4);
    c.closePath();
    c.fill();
    c.restore();
  }
  frame(now) {
    requestAnimationFrame(this.frame);
    const dt = Math.min((now - this.last) / 1000, 0.2);
    this.last = now;
    this.elapsed += dt;
    if (this.ready) {
      for (let remaining = dt; remaining > 0; ) {
        const step = Math.min(remaining, 0.025);
        this.updatePlayer(step);
        if (this.active) this.updateDevices(step);
        remaining -= step;
      }
    } else {
      this.camera.position.set(15, 18, 28);
      this.camera.lookAt(0, 0, 0);
    }
    for (const cloud of this.clouds) {
      cloud.position.x += dt * 0.3;
      if (cloud.position.x > 130) cloud.position.x = -130;
    }
    this.effects = this.effects.filter((e) => {
      e.ttl -= dt;
      if (e.ttl <= 0) {
        this.scene.remove(e.line);
        e.line.geometry.dispose();
        e.line.material.dispose();
        return false;
      }
      return true;
    });
    this.renderer.render(this.scene, this.camera);
    this.renderedFrames++;
    if (this.renderedFrames % 6 === 0) this.drawMinimap();
  }
  snapshot() {
    return {
      ready: this.ready,
      player: { x: this.pos.x, y: this.pos.z, z: this.pos.y },
      score: this.score,
      objects: [...this.objects.values()].map((o) => ({
        id: o.id,
        kind: o.kind,
        width: o.w,
        depth: o.d,
        height: o.h,
        visible: o.group.visible,
        x: o.group.position.x,
        y: o.group.position.z,
        z: o.group.position.y,
      })),
      frames: this.renderedFrames,
    };
  }
}

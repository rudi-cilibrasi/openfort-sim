import { test, expect } from "@playwright/test";
import * as THREE from "three";
import { World } from "../web/world.js";

test("new map objects can be picked before the first rendered frame", () => {
  const world = Object.create(World.prototype);
  world.container = {
    getBoundingClientRect: () => ({ left: 30, top: 50, width: 800, height: 600 }),
  };
  world.camera = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 100);
  world.camera.position.set(0, 2, 4);
  world.camera.lookAt(0, 1, -8);
  world.camera.updateMatrixWorld();
  world.mapGroup = new THREE.Group();
  const group = new THREE.Group();
  group.position.set(4, 1.8, -8);
  group.userData.id = "new-target";
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial();
  group.add(new THREE.Mesh(geometry, material));
  world.mapGroup.add(group);
  world.objects = new Map([["new-target", { id: "new-target", group }]]);

  // No renderer has visited the new scene graph yet.
  const screen = group.position.clone().project(world.camera);
  const hit = world.hitObject({
    clientX: 30 + ((screen.x + 1) * 800) / 2,
    clientY: 50 + ((1 - screen.y) * 600) / 2,
  });
  expect(hit?.obj.id).toBe("new-target");
  geometry.dispose();
  material.dispose();
});

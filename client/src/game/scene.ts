/** Signal Lab design: a translucent Babylon signal field supports the DOM typing console without competing with its text. */
import { Engine } from "@babylonjs/core/Engines/engine";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";

export type GameHandle = {
  scene: Scene;
  dispose: () => void;
};

type Pulse = {
  mesh: ReturnType<typeof MeshBuilder.CreateSphere>;
  age: number;
};

export async function createGameScene(engine: Engine, canvas: HTMLCanvasElement): Promise<GameHandle> {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 0);

  const camera = new FreeCamera("signal-camera", new Vector3(0, 0, -12), scene);
  camera.setTarget(Vector3.Zero());
  camera.minZ = 0.1;

  new HemisphericLight("signal-light", new Vector3(0, 1, -1), scene).intensity = 0.75;
  const glow = new GlowLayer("signal-glow", scene, { mainTextureFixedSize: 512, blurKernelSize: 48 });
  glow.intensity = 0.5;

  const mint = new Color3(0.44, 0.95, 0.77);
  const dimMint = new Color3(0.12, 0.42, 0.36);
  const lines = [-3.8, -2.4, -1.2, 1.4, 2.7, 4.1].map((y, index) => {
    const line = MeshBuilder.CreateBox(`signal-track-${index}`, { width: index % 2 === 0 ? 8.2 : 5.6, height: 0.018, depth: 0.02 }, scene);
    line.position = new Vector3(index % 2 === 0 ? 0.2 : -0.8, y, 0);
    const material = new StandardMaterial(`signal-track-mat-${index}`, scene);
    material.emissiveColor = index % 3 === 0 ? mint : dimMint;
    material.alpha = index % 3 === 0 ? 0.44 : 0.25;
    line.material = material;
    return line;
  });

  const pulses: Pulse[] = [];
  const packetListener = () => {
    const pulse = MeshBuilder.CreateSphere(`packet-${Date.now()}`, { diameter: 0.18, segments: 12 }, scene);
    pulse.position = new Vector3(-5.2, 0.25, 0);
    const material = new StandardMaterial(`packet-mat-${Date.now()}`, scene);
    material.emissiveColor = mint;
    material.alpha = 0.95;
    pulse.material = material;
    pulses.push({ mesh: pulse, age: 0 });
  };

  window.addEventListener("typing-packet", packetListener);
  let elapsed = 0;
  scene.onBeforeRenderObservable.add(() => {
    const delta = scene.getEngine().getDeltaTime() / 1000;
    elapsed += delta;
    lines.forEach((line, index) => {
      line.position.x = (index % 2 === 0 ? 0.2 : -0.8) + Math.sin(elapsed * 0.9 + index) * 0.22;
    });

    for (let index = pulses.length - 1; index >= 0; index -= 1) {
      const pulse = pulses[index];
      pulse.age += delta;
      pulse.mesh.position.x += delta * 7.5;
      pulse.mesh.scaling.setAll(1 + pulse.age * 1.1);
      const material = pulse.mesh.material as StandardMaterial;
      material.alpha = Math.max(0, 1 - pulse.age * 1.35);
      if (pulse.age > 0.75) {
        pulse.mesh.dispose();
        pulses.splice(index, 1);
      }
    }
  });

  return {
    scene,
    dispose: () => {
      window.removeEventListener("typing-packet", packetListener);
      pulses.forEach((pulse) => pulse.mesh.dispose());
      glow.dispose();
      scene.dispose();
    },
  };
}

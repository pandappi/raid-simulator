import { OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { MOUSE, Vector3 } from "three";
import { useRef } from "react";
import type { ComponentRef } from "react";
import { useSimulatorStore } from "../stores/simulatorStore";

type CameraOrbitControls = ComponentRef<typeof OrbitControls>;

export function CameraControls() {
  const controlsRef = useRef<CameraOrbitControls | null>(null);
  const directionRef = useRef(new Vector3());
  const desiredTargetRef = useRef(new Vector3());
  const previousTargetRef = useRef(new Vector3());
  const lastYawRef = useRef<number | null>(null);

  useFrame(({ camera }, delta) => {
    const controls = controlsRef.current;
    if (controls) {
      const { sessionId, players } = useSimulatorStore.getState();
      const self = sessionId ? players[sessionId] : null;
      desiredTargetRef.current.set(self?.x ?? 0, 0, self?.z ?? 0);

      previousTargetRef.current.copy(controls.target);
      controls.target.lerp(desiredTargetRef.current, 1 - Math.exp(-delta * 12));
      camera.position.add(controls.target.clone().sub(previousTargetRef.current));
      controls.update();
    }

    camera.getWorldDirection(directionRef.current);
    const { x, z } = directionRef.current;
    const length = Math.hypot(x, z);
    if (length === 0) {
      return;
    }

    const cameraYaw = Math.atan2(x / length, z / length);
    if (lastYawRef.current === null || Math.abs(cameraYaw - lastYawRef.current) > 0.001) {
      lastYawRef.current = cameraYaw;
      useSimulatorStore.getState().setCameraYaw(cameraYaw);
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      autoRotate={false}
      dampingFactor={0}
      enableDamping={false}
      enablePan={false}
      enableRotate
      enableZoom
      makeDefault
      maxDistance={45}
      maxPolarAngle={Math.PI / 2.3}
      minDistance={8}
      minPolarAngle={Math.PI / 6}
      mouseButtons={{
        LEFT: MOUSE.PAN,
        MIDDLE: MOUSE.PAN,
        RIGHT: MOUSE.ROTATE
      }}
    />
  );
}

import { OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { MOUSE, Vector3 } from "three";
import { useRef } from "react";
import { useSimulatorStore } from "../stores/simulatorStore";

export function CameraControls() {
  const directionRef = useRef(new Vector3());
  const lastYawRef = useRef<number | null>(null);

  useFrame(({ camera }) => {
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

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
  const orientedRef = useRef(false);

  useFrame(({ camera }, delta) => {
    const controls = controlsRef.current;
    const { sessionId, players, gimmick } = useSimulatorStore.getState();
    const self = sessionId ? players[sessionId] : null;
    if (controls) {
      desiredTargetRef.current.set(self?.x ?? 0, 0, self?.z ?? 0);

      previousTargetRef.current.copy(controls.target);
      controls.target.lerp(desiredTargetRef.current, 1 - Math.exp(-delta * 12));
      camera.position.add(controls.target.clone().sub(previousTargetRef.current));
      controls.update();
    }

    // 기믹 시작 시 1회: 플레이어 뒤에서 보스를 바라보는 시점으로 정렬.
    if (!gimmick.bossActive) {
      orientedRef.current = false;
    } else if (controls && self && !orientedRef.current) {
      let dx = (gimmick.bossX ?? 0) - self.x;
      let dz = (gimmick.bossZ ?? 0) - self.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.5) {
        dx /= len;
        dz /= len;
      } else {
        dx = 0;
        dz = 1;
      }
      camera.position.set(self.x - dx * 14, 11, self.z - dz * 14);
      controls.target.set(self.x, 0, self.z);
      controls.update();
      orientedRef.current = true;
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
      maxDistance={18}
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

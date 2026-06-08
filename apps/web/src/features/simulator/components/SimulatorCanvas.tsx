import { Canvas } from "@react-three/fiber";
import { SimulatorScene } from "./SimulatorScene";

export function SimulatorCanvas() {
  return (
    <div className="canvas-wrap" onContextMenu={(event) => event.preventDefault()}>
      <Canvas camera={{ position: [0, 24, 24], fov: 50 }} dpr={[1, 2]}>
        <SimulatorScene />
      </Canvas>
    </div>
  );
}

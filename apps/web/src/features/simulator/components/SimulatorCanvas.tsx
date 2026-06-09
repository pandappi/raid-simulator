import { Canvas } from "@react-three/fiber";
import { BOSS_CAST_MS, MISSING_CAST_MS, TOWER_INTERVAL_MS } from "@raid-simulator/shared";
import { SimulatorScene } from "./SimulatorScene";
import { useSimulatorStore } from "../stores/simulatorStore";

export function SimulatorCanvas() {
  return (
    <div className="canvas-wrap" onContextMenu={(event) => event.preventDefault()}>
      <Canvas camera={{ position: [0, 24, 24], fov: 50 }} dpr={[1, 2]}>
        <SimulatorScene />
      </Canvas>
      <BossTargetFrame />
      <RaidwideFlash />
    </div>
  );
}

function BossTargetFrame() {
  const { bossCast, elapsed, round } = useSimulatorStore((state) => state.gimmick);
  const castLabel =
    bossCast === "missing" ? "행방불명" : bossCast === "future" ? "미래의 종언" : bossCast === "past" ? "과거의 종언" : null;
  const castStart = bossCast === "missing" ? 0 : MISSING_CAST_MS + Math.max(0, (round - 1) * TOWER_INTERVAL_MS);
  const castDuration = bossCast === "missing" ? MISSING_CAST_MS : BOSS_CAST_MS;
  const castProgress = castLabel ? Math.min(1, Math.max(0, (elapsed - castStart) / castDuration)) : 0;

  return (
    <div className="boss-target-ui">
      <div className="boss-target-name">보스</div>
      <div className="boss-hp-bar" aria-label="보스 체력">
        <div className="boss-hp-fill" />
      </div>
      <div className={`boss-cast ${castLabel ? "is-casting" : ""}`}>
        <div className="boss-cast-name">{castLabel ?? "시전 대기"}</div>
        <div className="boss-cast-bar" aria-label="캐스팅 진행률">
          <div className="boss-cast-fill" style={{ transform: `scaleX(${castProgress})` }} />
        </div>
      </div>
    </div>
  );
}

function RaidwideFlash() {
  const { elapsed, gimmick, phase } = useSimulatorStore((state) => state.gimmick);
  const flashDuration = 450;
  const flashElapsed = elapsed - MISSING_CAST_MS;
  const active = gimmick === "missing" && phase === "running" && flashElapsed >= 0 && flashElapsed <= flashDuration;
  const opacity = active ? Math.max(0, 1 - flashElapsed / flashDuration) : 0;

  return <div className="raidwide-flash" style={{ opacity }} aria-hidden="true" />;
}

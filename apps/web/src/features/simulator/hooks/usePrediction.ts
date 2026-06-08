import { useEffect } from "react";
import type { ClientInput } from "@raid-simulator/shared";
import { useSimulatorStore } from "../stores/simulatorStore";
import { advance } from "../netcode";

type UsePredictionParams = {
  enabled: boolean;
  sendInput: (input: ClientInput) => void;
};

/**
 * 매 프레임 클라이언트 예측을 진행하고, 순번이 매겨진 입력 명령을 서버로 보낸다.
 * 입력 캡처(useKeyboardInput)와 분리해, 이 루프가 예측·전송을 전담한다.
 */
export function usePrediction({ enabled, sendInput }: UsePredictionParams) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    let frame = 0;
    let last = performance.now();

    const tick = (time: number) => {
      const frameDt = Math.max(0, (time - last) / 1000);
      last = time;
      advance(frameDt, useSimulatorStore.getState().cameraYaw, sendInput);
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [enabled, sendInput]);
}

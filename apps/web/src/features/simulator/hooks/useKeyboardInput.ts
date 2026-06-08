import { useEffect, useRef } from "react";
import { SERVER_TICK_MS, type ClientInput } from "@raid-simulator/shared";
import { useSimulatorStore } from "../stores/simulatorStore";
import { setMoveInput } from "../netcode";

type UseKeyboardInputParams = {
  enabled: boolean;
  sendInput: (input: ClientInput) => void;
};

type MovementKey = "up" | "down" | "left" | "right";

const KEY_MAP: Record<string, MovementKey> = {
  w: "up",
  ㅈ: "up",
  arrowup: "up",
  s: "down",
  ㄴ: "down",
  arrowdown: "down",
  a: "left",
  ㅁ: "left",
  arrowleft: "left",
  d: "right",
  ㅇ: "right",
  arrowright: "right"
};

const CODE_MAP: Record<string, MovementKey> = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right"
};

export function useKeyboardInput({ enabled, sendInput }: UseKeyboardInputParams) {
  const inputRef = useRef<ClientInput>({
    up: false,
    down: false,
    left: false,
    right: false
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKey(event: KeyboardEvent, value: boolean) {
      if (isTextEntryElement(document.activeElement)) {
        return;
      }

      const key = KEY_MAP[event.key.toLowerCase()] ?? CODE_MAP[event.code];
      if (!key) {
        return;
      }

      event.preventDefault();
      // keydown 자동 반복으로 같은 상태가 다시 와도 중복 전송하지 않는다.
      if (inputRef.current[key] === value) {
        return;
      }

      inputRef.current = {
        ...inputRef.current,
        [key]: value
      };
      // 클라이언트 예측이 매 프레임 즉시 읽을 수 있도록 보유 입력을 공유한다.
      setMoveInput(inputRef.current);
      // 정지/이동 신호를 서버에 즉시 알려 멈춤 오차와 위치 격차를 줄인다.
      sendInput({
        ...inputRef.current,
        cameraYaw: useSimulatorStore.getState().cameraYaw
      });
    }

    const handleKeyDown = (event: KeyboardEvent) => handleKey(event, true);
    const handleKeyUp = (event: KeyboardEvent) => handleKey(event, false);
    const interval = window.setInterval(() => {
      sendInput({
        ...inputRef.current,
        cameraYaw: useSimulatorStore.getState().cameraYaw
      });
    }, SERVER_TICK_MS);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      inputRef.current = { up: false, down: false, left: false, right: false };
      setMoveInput(inputRef.current);
      sendInput(inputRef.current);
    };
  }, [enabled, sendInput]);
}

function isTextEntryElement(element: Element | null): boolean {
  if (!element) {
    return false;
  }

  const tagName = element.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

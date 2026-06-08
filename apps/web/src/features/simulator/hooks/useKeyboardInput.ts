import { useEffect, useRef } from "react";
import type { ClientInput } from "@raid-simulator/shared";
import { setMoveInput } from "../netcode";

type UseKeyboardInputParams = {
  enabled: boolean;
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

export function useKeyboardInput({ enabled }: UseKeyboardInputParams) {
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
      // keydown 자동 반복으로 같은 상태가 다시 와도 무시한다.
      if (inputRef.current[key] === value) {
        return;
      }

      inputRef.current = {
        ...inputRef.current,
        [key]: value
      };
      // 보유 입력을 예측 루프(usePrediction)가 매 스텝 읽어 명령을 만든다.
      setMoveInput(inputRef.current);
    }

    const handleKeyDown = (event: KeyboardEvent) => handleKey(event, true);
    const handleKeyUp = (event: KeyboardEvent) => handleKey(event, false);
    // 창 포커스를 잃으면 keyup이 안 와 키가 눌린 채로 남아 계속 이동할 수 있다.
    // 이때 모든 입력을 강제로 해제한다.
    const handleBlur = () => {
      inputRef.current = { up: false, down: false, left: false, right: false };
      setMoveInput(inputRef.current);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      inputRef.current = { up: false, down: false, left: false, right: false };
      setMoveInput(inputRef.current);
    };
  }, [enabled]);
}

function isTextEntryElement(element: Element | null): boolean {
  if (!element) {
    return false;
  }

  const tagName = element.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

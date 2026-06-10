export const MAX_PLAYERS = 8;
export const ARENA_RADIUS = 20;

// 서버 방 운영 한도
export const MAX_ROOMS = 30; // 동시에 만들 수 있는 방 수
export const ROOM_LIFETIME_MS = 15 * 60 * 1000; // 방 1개의 사용 가능 시간
export const IDLE_DISCONNECT_MS = 3 * 60 * 1000; // 무입력 시 연결 해제까지
export const PLAYER_MOVE_SPEED = 5.6;
export const SERVER_TICK_RATE = 20;
export const SERVER_TICK_MS = 1000 / SERVER_TICK_RATE;
export const PLAYER_RADIUS = 0.45;
export const PLAYER_HEIGHT = 1.4;

// 클라이언트 예측 시뮬레이션 고정 스텝(초). 서버도 입력 명령의 dt로 동일하게 재현한다.
export const CLIENT_SIM_RATE = 60;
export const CLIENT_SIM_DT = 1 / CLIENT_SIM_RATE;
// 서버가 한 입력 명령으로 허용하는 최대 dt(초). 비정상/과도한 이동 방지.
export const MAX_INPUT_DT = 0.1;

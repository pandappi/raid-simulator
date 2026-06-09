import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import colyseus from "colyseus";
import { getOccupiedHumanRoles, RaidRoom } from "./rooms/RaidRoom.js";

const { Server } = colyseus;

const PORT = Number(process.env.PORT ?? 2567);
const app = express();

// 허용할 웹 주소. 배포 시 CLIENT_ORIGIN 환경변수로 지정(쉼표로 여러 개 가능).
// 미지정 시 로컬 개발 주소를 허용한다.
const allowedOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:3100,http://127.0.0.1:3100,http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.get("/", (_request, response) => {
  response.send("Raid simulator server is running.");
});
app.get("/state", (_request, response) => {
  response.json({ occupiedRoles: getOccupiedHumanRoles() });
});

const server = createServer(app);
const gameServer = new Server({ server });

gameServer.define("raid_room", RaidRoom);

gameServer.listen(PORT).then(() => {
  console.log(`Raid simulator server listening on ws://localhost:${PORT}`);
});

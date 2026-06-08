import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import colyseus from "colyseus";
import { RaidRoom } from "./rooms/RaidRoom.js";

const { Server } = colyseus;

const PORT = Number(process.env.PORT ?? 2567);
const app = express();

app.use(cors({ origin: ["http://localhost:3000", "http://127.0.0.1:3000"] }));
app.get("/", (_request, response) => {
  response.send("Raid simulator server is running.");
});

const server = createServer(app);
const gameServer = new Server({ server });

gameServer.define("raid_room", RaidRoom);

gameServer.listen(PORT).then(() => {
  console.log(`Raid simulator server listening on ws://localhost:${PORT}`);
});

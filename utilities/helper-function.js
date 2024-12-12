import { parse } from "dotenv";
import { allRoomBets } from "../services/game-event.js";
import { read } from "./db-connection.js";
import { variableConfig } from "./load-config.js";
import { createLogger } from "./logger.js";
import { deleteCache, getCache } from "./redis-connection.js";
import { playerCount } from "../socket.js";

const failedBetLogger = createLogger("failedBets", "jsonl");
const failedPartialCashoutLogger = createLogger(
  "failedPartialCashout",
  "jsonl"
);
const failedCashoutLogger = createLogger("failedCashout", "jsonl");
const failedGameLogger = createLogger("failedGame", "jsonl");
export const logEventAndEmitResponse = (req, res, event, socket) => {
  let logData = JSON.stringify({ req, res });
  if (event === "bet") {
    failedBetLogger.error(logData);
  }
  if (event === "game") {
    failedGameLogger.error(logData);
  }
  if (event === "cashout") {
    failedCashoutLogger.error(logData);
  }
  if (event === "partialCashout") {
    failedPartialCashoutLogger.error(logData);
  }
  return socket.emit("betError", res);
};

const roomData = {
  rooms: [
    {
      rmId: 102,
      mnEy: 50,
      mnBt: 10,
      mxBt: 250,
      btCn: [10, 50, 100, 150, 250],
    },
    {
      rmId: 101,
      mnEy: 200,
      mnBt: 100,
      mxBt: 500,
      btCn: [100, 200, 300, 400, 500],
    },

    {
      rmId: 103,
      mnEy: 250,
      mnBt: 200,
      mxBt: 1000,
      btCn: [200, 350, 500, 750, 1000],
    },
    {
      rmId: 104,
      mnEy: 1000,
      mnBt: 500,
      mxBt: 2000,
      btCn: [500, 800, 1000, 1500, 2000],
    },
  ],
};

export const returnRoomDetails = () => {
  const roomsToSend =
    variableConfig.games_templates && variableConfig.games_templates.length > 0
      ? { rooms: variableConfig.games_templates }
      : roomData;
  return {
    rooms: roomsToSend.rooms.map((e) => ({
      ...e,
      playerCount: playerCount - Math.floor(e.mnBt / 20),
    })),
  };
};
export const getRoomDetails = (roomId) => {
  return returnRoomDetails()?.rooms.find((e) => e.rmId == roomId);
};
export const getCards = () => {
  let deck = [];
  let cardData = [];
  for (let x = 1; x < 53; x++) {
    deck.push(x);
  }
  const jokercard = deck.splice(
    Math.round(Math.random() * (deck.length - 1)),
    1
  )[0];
  do {
    cardData.push(
      deck.splice(Math.round(Math.random() * (deck.length - 1)), 1)[0]
    );
  } while (jokercard % 13 !== cardData[cardData.length - 1] % 13);
  return { jokercard, cardData };
};

export const exitRoom = async (io, socket, roomId) => {
  socket.leave(`${roomId}`);
  const userData = JSON.parse(
    await getCache(`PL:${socket.data.userInfo.userId}`)
  );

  const userBet = allRoomBets[roomId]?.find(
    (bet) => bet.identifier.split(":")[1] === userData.userId
  );

  if (userBet) userBet.roomExit = true;

  await deleteCache(`PRmD:${userData.userId}`);

  socket.emit("message", {
    action: "ex",
    msg: "true",
  });
};

export const getMatchHistory = async (rmId) => {
  try {
    const mhHistory = await read(
      `SELECT match_id as MhId, result as rs, UNIX_TIMESTAMP(created_at)*1000 as cTs
       FROM lobbies
       WHERE lobby_id = ${rmId}
       ORDER BY created_at DESC
       LIMIT 30;`
    );
    return { mhHistory };
  } catch (error) {
    console.error("Error fetching match history:", error);
    throw error;
  }
};

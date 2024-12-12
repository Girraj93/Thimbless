import { roomManager } from "./module/game/lobby.js";
import { getUserDataFromSource } from "./module/players/player-data.js";
import { registerEvents } from "./router/event-route.js";
import { joinRoom, reconnect } from "./services/game-event.js";
import { getRoomDetails } from "./utilities/helper-function.js";
//import { reconnect } from "./services/game-event.js";
import {
  deleteCache,
  getCache,
  setCache,
} from "./utilities/redis-connection.js";
export let playerCount = Math.floor(Math.random() * 100) + 100;
export const initSocket = (io) => {
  // initPlayerBase(io);
  const onConnection = async (socket) => {
    console.log("socket connected");
    const token = socket.handshake.query.token;
    const game_id = socket.handshake.query.game_id;
    if (!token) {
      socket.disconnect(true);
      return console.log("No Token Provided", token);
    }
    const userData = await getUserDataFromSource(token, game_id);
    socket.data["userInfo"] = userData;
    if (!userData) {
      console.log("Invalid token", token);
      return socket.disconnect(true);
    }
    playerCount++;
    // socket.emit("message", {
    //   action: "infoResponse",
    //   msg: {
    //     urId: userData.userId,
    //     urNm: userData.name,
    //     operator_id: userData.operatorId,
    //     bl: Number(userData.balance).toFixed(2),
    //     avIn: userData.image,
    //     crTs: Date.now(),
    //   },
    // });

    socket.emit("message", {
      action: "infoResponse",
      msg: JSON.stringify({
        urId: userData.userId,
        urNm: userData.name,
        operator_id: userData.operatorId,
        bl: Number(userData.balance).toFixed(2),
        avIn: userData.image,
        crTs: Date.now(),
      }),
    });
    await setCache(
      `PL:${userData.userId}`,
      JSON.stringify({ ...userData, socketId: socket.id }),
      3600
    );
    // reconnect(socket);
    registerEvents(io, socket);
    let userRoomId = await getCache(`PRmD:${userData.userId}`);

    console.log(userRoomId, "userroomId");
    console.log(socket.id, "socketid in connection");
    if (userRoomId) {
      const identifier = `${userData.operatorId}:${userData.userId}`;
      const socketID = `${socket.id}`;
      reconnect(userRoomId, identifier, socket, socketID);
    }
    socket.on("disconnect", async () => {
      playerCount--;
      await deleteCache(`PL:${userData.userId}`);
    });
    socket.on("error", (error) => {
      console.error(`Socket error: ${socket.id}. Error: ${error.message}`);
    });
  };
  io.on("connection", onConnection);
};

const initPlayerBase = async (io) => {
  try {
    for (const rmid in roomManager) {
      const rmDl = getRoomDetails(rmid);
      const playersBuff = Math.floor(rmDl.mnBt / 20);
      playerCount += Math.floor(Math.random() * 5);
      playerCount -= Math.floor(Math.random() * 5);
      io.to(rmid).emit("message", {
        action: "playercount",
        msg: `${playerCount - playersBuff}`,
      });
      setTimeout(() => initPlayerBase(io), 10000);
    }
  } catch (er) {
    console.error(er);
  }
};

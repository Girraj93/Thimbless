import { getUserDataFromSource } from "./module/players/player-data.js";
import { registerEvents } from "./router/event-route.js";
import {
  deleteCache,
  getCache,
  setCache,
} from "./utilities/redis-connection.js";

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

    registerEvents(io, socket);

    socket.on("disconnect", async () => {
      await deleteCache(`PL:${userData.userId}`);
    });
    socket.on("error", (error) => {
      console.error(`Socket error: ${socket.id}. Error: ${error.message}`);
    });
  };
  io.on("connection", onConnection);
};

// const initPlayerBase = async (io) => {
//   try {
//     for (const rmid in roomManager) {
//       const rmDl = getRoomDetails(rmid);
//       const playersBuff = Math.floor(rmDl.mnBt / 20);
//       playerCount += Math.floor(Math.random() * 5);
//       playerCount -= Math.floor(Math.random() * 5);
//       io.to(rmid).emit("message", {
//         action: "playercount",
//         msg: `${playerCount - playersBuff}`,
//       });
//       setTimeout(() => initPlayerBase(io), 10000);
//     }
//   } catch (er) {
//     console.error(er);
//   }
// };

import { getUserDataFromSource } from "./module/players/player-data.js";
import { registerEvents } from "./router/event-route.js";
import {
  deleteCache,
  getCache,
  setCache,
} from "./utilities/redis-connection.js";

export const initSocket = (io) => {
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

    socket.emit("info", {
      msg: ({
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

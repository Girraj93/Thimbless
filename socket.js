import { getUserDataFromSource } from "./module/players/player-data.js";
import { registerEvents } from "./router/event-route.js";
import {
  deleteCache,
  getCache,
  setCache,
} from "./utilities/redis-connection.js";
import { createLogger } from "./utilities/logger.js";
import { read } from "./utilities/db-connection.js";


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
      urId: userData.userId,
      urNm: userData.name,
      operator_id: userData.operatorId,
      bl: Number(userData.balance).toFixed(2),
      avIn: userData.image,
      crTs: Date.now(),
    });

    //send userDashboard history with event--------------------------------
 const userDashboardHistory = async (socket) => {
      const userId = socket.data?.userInfo?.user_id;
      if (!userId) {
        console.error("User ID not found in socket data");
        return socket.emit("error", "User not authenticated");
      }
      try {
        const historyEntries = await read(
          `SELECT result_index, bet_amount, win_amount ,ball_index AS openIndex
           FROM settlement 
           WHERE user_id = ? 
           ORDER BY created_at DESC 
           LIMIT 8`,
          [userId]
        );
        socket.emit("history", historyEntries);
      } catch (error) {
        console.error("Error fetching user history:", error);
        socket.emit("error", "Failed to fetch user history");
      }
    };
    
    
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
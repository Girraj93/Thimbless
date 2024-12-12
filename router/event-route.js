import { roomDetails, joinRoom, handleBet } from "../services/game-event.js";
import { exitRoom } from "../utilities/helper-function.js";

export const registerEvents = async (io, socket) => {
  socket.on("action", (data) => {
    const event = data.split(":");
    switch (event[0]) {
      case "jn":
        return joinRoom(io, socket, event[1]);
      case "PB":
        return handleBet(io, socket, event.slice(1, event.length));
      case "ex":
        return exitRoom(io, socket, event[1]);
    }
  });
  socket.on("getRooms", async () => await roomDetails(socket));
};

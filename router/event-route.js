export const registerEvents = async (io, socket) => {
  socket.on("action", (data) => {
    const event = data.split(":");
    switch (event[0]) {
      case "jn":
        return console.log("jn");
      case "PB":
        return console.log("jn");
      case "ex":
        return console.log("jn");
    }
  });
};

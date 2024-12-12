import express from "express";
import { json } from "express";
import { Server } from "socket.io";
import cors from "cors";
import { createServer } from "http";
import { initSocket } from "./socket.js";
import dotenv from "dotenv";
dotenv.config();
const port = process.env.PORT || 4200;
import { createLogger } from "./utilities/logger.js";
import { checkDatabaseConnection } from "./utilities/db-connection.js";
import { initializeRedis } from "./utilities/redis-connection.js";
import { connect } from "./utilities/amqp.js";
import { loadConfig } from "./utilities/load-config.js";
import router from "./router/api-routes.js";
const logger = createLogger("Server");

const startServer = async () => {
  await Promise.all([checkDatabaseConnection(), initializeRedis(), connect()]);
  await loadConfig();
  var app = express();
  let server = createServer(app);
  var io = new Server(server);
  app.use(cors());
  app.use(express.json());
  app.use("/routes", router);
  initSocket(io);
  app.get("/", (req, res) => {
    return res
      .status(200)
      .send({ status: true, msg: "Twist game server is up and running" });
  });

  server.listen(port, () => {
    logger.info(`Server listening at PORT ${port}`);
  });
};

startServer();

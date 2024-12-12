import { parse } from "dotenv";
import { createLogger } from "./logger.js";

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

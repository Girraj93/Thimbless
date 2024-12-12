import axios from "axios";
import crypto from "crypto";
import { sendToQueue } from "./amqp.js";
import { createLogger } from "./logger.js";
const thirdPartyLogger = createLogger("ThirdPartyRequest", "jsonl");
const failedThirdPartyLogger = createLogger("FailedThirdPartyRequest", "jsonl");

export const generateUUIDv7 = () => {
  const timestamp = Date.now();
  const timeHex = timestamp.toString(16).padStart(12, "0");
  const randomBits = crypto.randomBytes(8).toString("hex").slice(2);
  const uuid = [
    timeHex.slice(0, 8),
    timeHex.slice(8) + randomBits.slice(0, 4),
    "7" + randomBits.slice(4, 7),
    ((parseInt(randomBits.slice(7, 8), 16) & 0x3f) | 0x80).toString(16) +
      randomBits.slice(8, 12),
    randomBits.slice(12),
  ];
  return uuid.join("-");
};

export const updateBalanceFromAccount = async (data, key, playerDetails) => {
  try {
    const webhookData = await prepareDataForWebhook(
      { ...data, game_id: playerDetails.game_id },
      key
    );
    if (key === "CREDIT") {
      thirdPartyLogger.info(
        JSON.stringify({ logId: generateUUIDv7(), webhookData, playerDetails })
      );
      await sendToQueue(
        "",
        "games_cashout",
        JSON.stringify({
          ...webhookData,
          operatorId: playerDetails.operatorId,
          token: playerDetails.token,
        })
      );
      return true;
    }
    data.txn_id = webhookData.txn_id;
    const sendRequest = await sendRequestToAccounts(
      webhookData,
      playerDetails.token
    );
    if (!sendRequest) return false;
    return data;
  } catch (err) {
    console.error(`Err while updating Player's balance is`, err);
    return false;
  }
};

export const prepareDataForWebhook = async (betObj, key, socket) => {
  try {
    let { lobby_id, betAmount, game_id, bet_id, final_amount, user_id, txnId } =
      betObj;
    let userIP = socket?.handshake?.address || "";
    if (socket && socket.handshake.headers["x-forwarded-for"]) {
      userIP = socket.handshake.headers["x-forwarded-for"].split(",")[0].trim();
    }
    let obj = {
      amount: Number(betAmount).toFixed(2),
      txn_id: generateUUIDv7(),
      ip: userIP,
      game_id,
      user_id: decodeURIComponent(user_id),
    };
    switch (key) {
      case "DEBIT":
        obj.description = `${obj.amount} debited for Andar Bahar game for Round ${lobby_id}`;
        obj.bet_id = bet_id;
        obj.txn_type = 0;
        break;
      case "CREDIT":
        obj.amount = final_amount;
        obj.txn_ref_id = txnId;
        obj.description = `${final_amount} credited for Andar Bahar game for Round ${lobby_id}`;
        obj.txn_type = 1;
        break;
      default:
        obj;
    }
    return obj;
  } catch (err) {
    console.error(`[ERR] while trying to prepare data for webhook is::`, err);
    return false;
  }
};

export const postDataToSourceForBet = async (data) => {
  try {
    return new Promise((resolve, reject) => {
      const { webhookData, token, socketId } = data;
      const url = process.env.service_base_url;
      let clientServerOptions = {
        method: "POST",
        url: `${url}/service/operator/user/balance/v2`,
        headers: {
          token,
        },
        data: webhookData,
        timeout: 1000 * 5,
      };
      axios(clientServerOptions)
        .then((result) => {
          thirdPartyLogger.info(
            JSON.stringify({ req: data, res: result?.data })
          );
          resolve({ status: result.status, ...webhookData, socketId });
        })
        .catch((err) => {
          console.log(`[ERR] received from upstream server`, err);
          let response = err.response
            ? err.response?.data
            : "Something went wrong";
          console.log(
            JSON.stringify({ req: { webhookData, token }, res: response })
          );
          reject({ ...webhookData, socketId });
        });
    });
  } catch (err) {
    console.error(`[ERR] while posting data to source is:::`, err);
    console.error(JSON.stringify({ req: data, res: `Something went wrong` }));
    return false;
  }
};

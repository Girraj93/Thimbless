import {
  deleteCache,
  getCache,
  setCache,
} from "../../utilities/redis-connection.js";
import {
  generateUUIDv7,
  postDataToSourceForBet,
  prepareDataForWebhook,
} from "../../utilities/common-function.js";
import { sendToQueue } from "../../utilities/amqp.js";
import { addSettleBet, insertBets } from "../bet/bet-db.js";
import { match } from "assert";

export const startMatch = async (io, socket, event) => {
let betObj = {};
  await handleBet(io, socket, event,betObj);
  const userResultIndex = userResultIndexGenerator(event[1]);
  await settleBet(socket, userResultIndex, event, betObj);
}

export const handleBet = async (io, socket, event,betObj) => {
  const user_id = socket.data?.userInfo.user_id;
  let playerDetails = await getCache(`PL:${user_id}`);
  if (!playerDetails)
    return socket.emit("error", "Invalid Player Details");
  const parsedPlayerDetails = JSON.parse(playerDetails);
  const { userId, operatorId, token, game_id, balance } = parsedPlayerDetails;
  const matchId = generateUUIDv7()
  const bet_id = `BT:${matchId}:${userId}:${operatorId}`;
  const [betAmt, balls, userBallIndex] = event;
   Object.assign(betObj,{
    betAmt,
    bet_id,
    token,
    socket_id: parsedPlayerDetails.socketId,
    game_id,
    matchId
  })

  if (Number(betAmt) > Number(balance)) {
    return socket.emit("error","insufficient balance");
  }
  const webhookData = await prepareDataForWebhook(
    {
      betAmount: betAmt,
      game_id,
      user_id: userId,
      matchId
    },
    "DEBIT",
    socket
  );
  betObj.txn_id = webhookData.txn_id;
  try {
    await postDataToSourceForBet({
      webhookData,
      token,
      socketId: socket.id,
    });
  } catch (err) {
    JSON.stringify({ req: bet_id, res: "bets cancelled by upstream" })
    return socket.emit("error","Bet Cancelled by Upstream Server")
  }
  await insertBets({
    bet_id,
    user_id,
    operator_id: operatorId,
    matchId,
    betAmt,
    userBallIndex
  })
  parsedPlayerDetails.balance = Number(balance - Number(betAmt)).toFixed(2);
  await setCache(`PL:${socket.id}`, JSON.stringify(parsedPlayerDetails));
  socket.emit("info", {
      urId: userId,
      urNm: parsedPlayerDetails.name,
      operator_id: operatorId,
      bl: Number(parsedPlayerDetails.balance).toFixed(2),
      avIn: parsedPlayerDetails.image,
  });
  socket.emit("message","Bet Placed successfully")
}

const userResultIndexGenerator = (balls) => {
  const results = [];
  const range = ["L", "C", "R"];
  while (results.length < balls && results.length < range.length) {
    const randomValue = range[Math.floor(Math.random() * range.length)];
    if (!results.includes(randomValue)) {
      results.push(randomValue);
    }
  }
  return results;
};

const settleBet = async (socket, userResultIndex, event, betObj) => {
  const { bet_id, txn_id, game_id, token } = betObj;
  const settlements = [];
  const [betAmt, balls, userBallIndex] = event;
  const [initial, matchId, user_id, operator_id] = bet_id.split(":");

  let userWins = winAmount(userBallIndex, userResultIndex, betAmt,balls)

  settlements.push({
    bet_id,
    user_id,
    operator_id,
    matchId,
    userBallIndex,
    betAmt,
    userResultIndex,
    winAmount: userWins
  });

  if (userWins > 0) {
    const webhookData = await prepareDataForWebhook(
      {
        user_id,
        win_amt: userWins,
        game_id,
        txnId: txn_id,
        matchId
      },
      "CREDIT",
      socket
    );
    // creditQueueLogger.info(
    //   JSON.stringify({ ...webhookData, operatorId: operator_id, token })
    // );
    await sendToQueue(
      "",
      "games_cashout",
      JSON.stringify({ ...webhookData, operatorId: operator_id, token: token })
    );
    const cachedPlayerDetails = await getCache(`PL:${user_id}`);
    if (cachedPlayerDetails) {
      const parsedPlayerDetails = JSON.parse(cachedPlayerDetails);
      parsedPlayerDetails.balance = Number(
        Number(parsedPlayerDetails.balance) + Number(userWins)
      ).toFixed(2);
      await setCache(
        `PL:${user_id}`,
        JSON.stringify(parsedPlayerDetails)
      );
    }
  }
  socket.emit("result",`${user_id}:${betAmt}:${userBallIndex.trim()}:${userResultIndex}:${userWins}`)
  userDashboardHistory(betAmt,socket,userWins,userResultIndex)
    await addSettleBet(settlements)
}

const winAmount = (userBallIndex, userResultIndex, betAmt,balls) => {
  let winAmt = 0;
  const normalizeduserBallIndex = userBallIndex.trim().toUpperCase();
  const normalizeduserResultIndexs = userResultIndex.map(value => value.trim().toUpperCase());

  for (let value of normalizeduserResultIndexs) {
    if (value === normalizeduserBallIndex) {
      if(balls === 1){
      winAmt = betAmt * 2.88;
      }
      else{
        winAmt = betAmt * 1.44; 
      }
      break;
    }
  }
  return winAmt;
};

export const reconnect = async (socket) => {

  socket.emit("rjn_status", ({
    }),
)}

export const userDashboardHistory = async(betAmt,socket,userWins,userResultIndex) =>{
  socket.emit("history",`${userResultIndex}:${betAmt}:${userWins}`)
}

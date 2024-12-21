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
import { read } from "../../utilities/db-connection.js";

export const startMatch = async (io, socket, event) => {
  let betObj = {};
  await handleBet(io, socket, event, betObj);
  const [betAmt, balls, ballIndex] = event;
  const matchIndexes = randomIndexGenerator(balls);
  await settleBet(socket, matchIndexes, event, betObj);
}

//handle bets and Debit transation---------------------------------------
export const handleBet = async (io, socket, event, betObj) => {
  const user_id = socket.data?.userInfo.user_id;
  let playerDetails = await getCache(`PL:${user_id}`);
  if (!playerDetails)
    return socket.emit("error", "Invalid Player Details");
  const parsedPlayerDetails = JSON.parse(playerDetails);
  const { userId, operatorId, token, game_id, balance } = parsedPlayerDetails;
  const matchId = generateUUIDv7()
  const bet_id = `BT:${matchId}:${userId}:${operatorId}`;
  const [betAmt, balls, ballIndex] = event;
  Object.assign(betObj, {
    betAmt,
    bet_id,
    token,
    socket_id: parsedPlayerDetails.socketId,
    game_id,
    matchId
  })

  if (Number(betAmt) > Number(balance)) {
    return socket.emit("error", "insufficient balance");
  }
  const webhookData = await prepareDataForWebhook(
    {
      betAmount: betAmt,
      game_id,
      user_id: userId,
      matchId,
      bet_id,
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
    return socket.emit("error", "Bet Cancelled by Upstream Server")
  }
  await insertBets({
    bet_id,
    user_id,
    operator_id: operatorId,
    matchId,
    betAmt,
    ballIndex
  })
  parsedPlayerDetails.balance = Number(balance - Number(betAmt)).toFixed(2);
  await setCache(`PL:${socket.id}`, JSON.stringify(parsedPlayerDetails));
  socket.emit("message", "Bet Placed successfully")
}

 //random generate indexes-----------------------------------------------
const randomIndexGenerator = (balls) => {
  const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  };
  const singleBallIndexes = shuffleArray([1, 0, 0]);//single ball case
  const doubleBallIndexes = shuffleArray([1, 1, 0]); //double ball case
  return Number(balls) === 1 ? singleBallIndexes : doubleBallIndexes;
};

//win_loose----status-----------------------------------------------
const settleBet = async (socket, matchIndexes, event, betObj) => {
  const { bet_id, txn_id, game_id, token } = betObj;
  const [betAmt, balls, ballIndex] = event;
  const [initial, matchId, user_id, operator_id] = bet_id.split(":");
  let userWins = 0;
  const settlements = [
    {
      bet_id,
      user_id,
      operator_id,
      matchId,
      ballIndex: ballIndex.trim(),
      betAmt,
      matchIndexes,
      userWins,
    },
  ];

  //credit transation - win case-----------------------------------
  if (matchIndexes[Number(ballIndex)] === 1) {
    userWins = Number(balls) === 1 ? Number(betAmt) * 2.88 : Number(betAmt) * 1.44;
    const settlements = [
      {
        bet_id,
        user_id,
        operator_id,
        matchId,
        ballIndex: ballIndex.trim(),
        betAmt,
        matchIndexes,
        userWins,
      },
    ];
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
      const resultData = {
        userId: user_id,
        betAmt: Number(betAmt),
        ballIndex: ballIndex.trim(),
        matchIndexes: matchIndexes,
        userWins: userWins.toFixed(2),
        balance: parsedPlayerDetails.balance
      };
      socket.emit("result", resultData);
    }
    await addSettleBet(settlements)
  }

  //loose condition------------------------------------------------
  else {
    addSettleBet(settlements)
    const cachedPlayerDetails = await getCache(`PL:${user_id}`);
    if (cachedPlayerDetails) {
      const parsedPlayerDetails = JSON.parse(cachedPlayerDetails);
      const resultData = {
        userId: user_id,
        betAmt: Number(betAmt),
        ballIndex: ballIndex.trim(),
        matchIndexes: matchIndexes,
        userWins: userWins.toFixed(2),
        balance: parsedPlayerDetails.balance,
      };
      socket.emit("result", resultData);
    }
  }
  userDashboardHistory(socket);
}

//send userDashboard history with event--------------------------------
export const userDashboardHistory = async (socket) => {
  const userId = socket.data?.userInfo?.user_id;
  if (!userId) {
    console.error("User ID not found in socket data");
    return socket.emit("error", "User not authenticated");
  }
  try {
    const historyEntries = await read(
      `SELECT result_index, bet_amount, win_amount 
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
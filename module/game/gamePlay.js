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

  export const startMatch = async(io,socket,event)=>{
 await handleBet(io,socket,event);
  }

  export const handleBet = async(io,socket,event)=>{
    const user_id = socket.data?.userInfo.user_id;
    let playerDetails = await getCache(`PL:${user_id}`);
    if (!playerDetails)
      return socket.emit("message", {
        action: "betError",
        msg: "Invalid Player Details",
      });
    const parsedPlayerDetails = JSON.parse(playerDetails);
    const { userId, operatorId, token, game_id, balance } = parsedPlayerDetails;
    const matchId =  generateUUIDv7()
    const bet_id = `BT:${matchId}:${userId}:${operatorId}`;
    const [betAmt,balls,betOn]= event;
    const betObj = {
        betAmt,
        bet_id,
        token,
        socket_id: parsedPlayerDetails.socketId,
        game_id,
       matchId
      };
    if (Number(betAmt) > Number(balance)) {
        return socket.emit("message", {
          action: "betError",
          msg: `insufficient balance`,
        });
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
        return socket.emit("message", {
          action: "betError",
          msg: `Bet Cancelled by Upstream Server`,
        });
      }
      await insertBets({
        bet_id,
        user_id,
        operator_id:operatorId,
        bet_amount:betAmt,
        bet_on:betOn
      })
    parsedPlayerDetails.balance = Number(balance - Number(betAmt)).toFixed(2);
    await setCache(`PL:${socket.id}`, JSON.stringify(parsedPlayerDetails));
    socket.emit("message", {
      action: "infoResponse",
      msg: JSON.stringify({
        urId: userId,
        urNm: parsedPlayerDetails.name,
        operator_id: operatorId,
        bl: Number(parsedPlayerDetails.balance).toFixed(2),
        avIn: parsedPlayerDetails.image,
      }),
    });
    socket.emit("message", {
      action: "bet",
      msg: `Bet Placed successfully`,
    });
    const randomNumber = randomNumberGenerator(event[1]);
    await settleBet(socket, randomNumber,event,betObj);   
}

  const randomNumberGenerator = (balls) => {
    const results = [];
    const range = ["L","C","R"];
    while (results.length < balls && results.length < range.length) {
      const randomValue = range[Math.floor(Math.random() * range.length)];
      if (!results.includes(randomValue)) {
        results.push(randomValue);
      }
    }
    return results;
  };

const settleBet = async (socket, randomNumber,event,betObj) => {
  const {bet_id,txn_id,game_id,token} = betObj;
  const settlements = [];
  // const user_id = socket.data?.userInfo.user_id;
  // const playerDetails = JSON.parse(await getCache(`PL:${user_id}`));
  // const game_id = playerDetails.game_id;
  const [betAmt,balls,betOn]  = event;
  const [initial, matchId, user_id, operator_id] = bet_id.split(":");

let userWins = winAmount(betOn,randomNumber,betAmt)
  settlements.push({
    bet_id,
    user_id,
    operator_id,
    betAmt,
    winAmount: userWins
  });
  const webhookData = await prepareDataForWebhook(
      {
        user_id,
        win_amt:userWins,
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
      JSON.stringify({ ...webhookData, operatorId:operator_id,token:token})
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
    socket.emit("result",{
      msg:`${user_id}:${betAmt}:${betOn}:${randomNumber}:${userWins}`
  })
     await addSettleBet(settlements)
  }

  const winAmount = (betOn, randomNumber, betAmt) => {
    let winAmt = 0;
    const normalizedBetOn = betOn.trim().toUpperCase();
    const normalizedRandomNumbers = randomNumber.map(value => value.trim().toUpperCase());
  
    for (let value of normalizedRandomNumbers) {
      if (value === normalizedBetOn) {
        winAmt = betAmt * 1.25;
        break;
      }
    }
    return winAmt;
  };
  
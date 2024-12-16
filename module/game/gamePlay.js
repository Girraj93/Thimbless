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
import { insertBets } from "../bet/bet-db.js";

  export const startMatch = async(io,socket,event)=>{
    await handleBet(io,socket,event);
    const randomNumber = randomNumberGenerator(event[2]);
    await settleBet(socket, randomNumber,event);
  }
  const randomNumberGenerator = (balls) => {
    const results = [];
    const range = [1, 2, 3];
    while (results.length < balls && results.length < range.length) {
      const randomValue = range[Math.floor(Math.random() * range.length)];
      if (!results.includes(randomValue)) {
        results.push(randomValue);
      }
    }
    return results;
  };
  const settleBet = async (socket, randomNumber,event) => {
    let winAmt = 0;
    const txn_id =generateUUIDv7();
    const user_id = socket.data?.userInfo.user_id;
    const playerDetails = JSON.parse(await getCache(`PL:${user_id}`));
    const game_id = playerDetails.game_id;
    const [betAmt,betOn,balls]  = event;
    for(let value of randomNumber){
       if(value === Number(betOn)){
          winAmt = betAmt*1.25
       }
    }
    const webhookData = await prepareDataForWebhook(
        {
          user_id,
          win_amt:winAmt,
          game_id,
          txnId: txn_id,
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
        JSON.stringify({ ...webhookData, operatorId:playerDetails.operator_id,token:playerDetails.token})
      );
      const cachedPlayerDetails = await getCache(`PL:${user_id}`);
      if (cachedPlayerDetails) {
        const parsedPlayerDetails = JSON.parse(cachedPlayerDetails);

        parsedPlayerDetails.balance = Number(
          Number(parsedPlayerDetails.balance) + Number(winAmt)
        ).toFixed(2);
        await setCache(
          `PL:${user_id}`,
          JSON.stringify(parsedPlayerDetails)
        );
      }
      socket.emit("message",{
        action: "result",
        msg:`${user_id}:${betAmt}:${betOn}:${winAmt}`
    })
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
    // const win_amt= 0;
    const bet_id = `BT:${userId}:${operatorId}`;
    const [betAmt,betOn]= event;
    const betObj = {
        betAmt,
        bet_id,
        token,
        socket_id: parsedPlayerDetails.socketId,
        game_id,
        // win_amt,
        // matchId,
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
        //.error(
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
    return socket.emit("message", {
      action: "bet",
      msg: `Bet Placed successfully`,
    });
}

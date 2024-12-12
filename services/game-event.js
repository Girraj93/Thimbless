import {
  deleteCache,
  getCache,
  setCache,
} from "../utilities/redis-connection.js";
import {
  getMatchHistory,
  returnRoomDetails,
} from "../utilities/helper-function.js";
import {
  emitLastevent,
  initNewMatch,
  makeResponse,
} from "../module/game/lobby.js";
import { write } from "../utilities/db-connection.js";
import moment from "moment";
import { uuidv7 } from "uuidv7";
import {
  generateUUIDv7,
  postDataToSourceForBet,
  prepareDataForWebhook,
} from "../utilities/common-function.js";
import { sendToQueue } from "../utilities/amqp.js";
import { addSettleBet, insertBets } from "../module/bets/bet-db.js";

let games = {};
export const allRoomBets = {};

export const roomDetails = (socket) => {
  return socket.emit("getRoomsResponse", returnRoomDetails());
};

export const joinRoom = async (io, socket, roomId) => {
  console.log(roomId, "roomid");
  console.log("socket.data-------------------------", socket.data);
  const cachedPlayerDetails = await getCache(
    `PL:${socket.data.userInfo.userId}`
  );
  if (!cachedPlayerDetails)
    return socket.emit("message", {
      action: "error",
      message: "no user found",
    });

  let playerDetails = JSON.parse(cachedPlayerDetails);
  console.log(playerDetails.userId);

  await deleteCache(`PRmD:${playerDetails.userId}`);
  let existingRoomId = await getCache(`PRmD:${playerDetails.userId}`);

  if (!existingRoomId) {
    console.log("existingRoomId called");
    await setCache(`PRmD:${playerDetails.userId}`, `${roomId}`);
  }

  const roomName = `${roomId}`;
  const roomData = returnRoomDetails();
  const rooms = roomData.rooms;
  let selectedRoom = rooms.find((room) => room.rmId === +roomId);

  if (!selectedRoom) return socket.emit("error", "Invalid room settings");

  const currentGame = games[roomName];
  console.log(currentGame, "currentgame");
  socket.join(roomName);
  let mhHistory = await getMatchHistory(selectedRoom.rmId);
  console.log("match history in satrtmatch");
  socket.emit("message", {
    action: "matchHistory",
    msg: JSON.stringify(mhHistory),
  });

  if (Array.isArray(allRoomBets[roomName])) {
    const userBet = allRoomBets[roomName].find(
      (bet) => bet.identifier.split(":")[1] === playerDetails.userId
    );
    console.log(userBet, "userBet");
    if (userBet) {
      userBet.roomExit = false;
    }

    if (userBet?.userBets) {
      const bets = Object.values(
        userBet.userBets.reduce((acc, { betAmount, betOn }) => {
          acc[betOn] = acc[betOn] || { betAmount: "0", betOn };
          acc[betOn].betAmount = String(
            Number(acc[betOn].betAmount) + Number(betAmount)
          );
          return acc;
        }, {})
      );

      socket.emit("message", {
        action: "jn",
        msg: `${playerDetails.userId} joined room ${roomName}`,
      });
      socket.emit("message", {
        action: "rjn_status",
        msg: JSON.stringify({ bets }),
      });
    } else {
      socket.emit("message", {
        action: "jn",
        msg: `No user bets found for ${playerDetails.userId}`,
      });
    }
  } else {
    socket.emit("message", {
      action: "jn",
      msg: `${playerDetails.userId} joined room ${roomName}`,
    });
  }
  // socket.emit("message", {
  //   action: "jn",
  //   msg:`${playerDetails.userId} joined room ${roomName}`,
  // });

  if (!currentGame) {
    const gameData = {
      crts: 0,
      udts: 0,
      playerDetails: [playerDetails],
      selectedRoom,
      matchHistory: [],
      createdTimestamp: 0,
      updatedTimestamp: 0,
      currentMatch: {},
      eventEndTime: 0,
      baharCard: [],
      anderCard: [],
      timestamp: 0,
      jokerCard: 0,
      cards: [],
      matchStarted: false,
      payout: [],
      demo: [],
    };

    games[roomId] = gameData;
    initNewMatch(io, socket, selectedRoom);
  } else {
    currentGame.playerDetails.push(playerDetails);
    const data = makeResponse(selectedRoom);
    if (data) setTimeout(() => socket.emit("gameState", data), 100);
  }
  return;
};

export const handleBet = async (io, socket, event) => {
  try {
    let playerDetails = await getCache(`PL:${socket.data.userInfo.userId}`);
    if (!playerDetails)
      return socket.emit("message", {
        eventName: "betError",
        msg: "Invalid Player Details",
      });
    const parsedPlayerDetails = JSON.parse(playerDetails);
    const { userId, operatorId, token, game_id, balance } = parsedPlayerDetails;
    console.log(event, "event");
    const [matchId, lobbyId, bets] = event;
    const userBets = bets.split(`,`);
    const bet_id = `BT:${matchId}:${userId}:${operatorId}`;
    const identifier = `${operatorId}:${userId}`;
    const betObj = {
      bet_id,
      token,
      socket_id: parsedPlayerDetails.socketId,
      game_id,
      lobbyId,
      matchId,
      identifier,
      roomExit: false,
    };
    const roomData = returnRoomDetails();
    const rooms = roomData.rooms;

    const selectedRoom = rooms.find((room) => room.rmId === Number(lobbyId));
    if (!selectedRoom) {
      return socket.emit("message", {
        action: "betError",
        msg: { message: `Invalid Room`, status: false },
      });
    }

    console.log(selectedRoom, "selectedRoom in handle bet");
    let currentGameState = makeResponse(selectedRoom);
    // console.info('------------handleBetData--------------')

    if (currentGameState.curMh.gmSt === 2) {
      if (currentGameState.curMh.MhId !== matchId) {
        return socket.emit("message", {
          action: "betError",
          msg: { message: `Invalid MatchId`, status: false },
        });
      }

      let invalidBet = false;
      let totalBetAmount = 0;
      let totalUserBet = [];

      userBets.forEach((bet) => {
        const [betAmount, betOn] = bet.split("-");
        const data = { betAmount, betOn };

        if (!selectedRoom.btCn.includes(Number(betAmount))) {
          invalidBet = true;
        }

        totalBetAmount += Number(betAmount);
        totalUserBet.push(data);
      });

      if (invalidBet) {
        return socket.emit("message", {
          action: "betError",
          msg: `Invalid bet`,
        });
      }

      if (Number(totalBetAmount) > Number(balance)) {
        return socket.emit("message", {
          action: "betError",
          msg: `insufficient balance`,
        });
      }

      Object.assign(betObj, {
        bet_amount: totalBetAmount,
        userBets: totalUserBet,
      });

      const webhookData = await prepareDataForWebhook(
        {
          lobby_id: matchId,
          betAmount: totalBetAmount,
          game_id,
          matchId,
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
        console.error(
          JSON.stringify({ req: bet_id, res: "bets cancelled by upstream" })
        );
        return socket.emit("message", {
          action: "betError",
          msg: `Bet Cancelled by Upstream Server`,
        });
      }

      if (allRoomBets[lobbyId] && allRoomBets[lobbyId].length > 0) {
        allRoomBets[lobbyId].push(betObj);
      } else {
        allRoomBets[lobbyId] = [betObj];
      }

      // const existingBets = JSON.parse(await getCache(`CG:BETS`)) || [];
      // existingBets.push(betObj);
      // await setCache(`CG:BETS`, JSON.stringify(existingBets));

      //Insert into Database
      // await insertBets({
      //   totalBetAmount,
      //   bet_id,
      //   roomId,
      //   lobby_id: betObj.lobby_id,
      //   userBets: betObj.userBets,
      // });
      //Insert into Database
      await insertBets({
        totalBetAmount,
        bet_id,
        roomId: lobbyId,
        userBets: betObj.userBets,
      });
      parsedPlayerDetails.balance = Number(
        balance - Number(totalBetAmount)
      ).toFixed(2);
      await setCache(
        `PL:${socket.data.userInfo.userId}`,
        JSON.stringify(parsedPlayerDetails)
      );
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
    } else {
      console.log("not defined beton and amount in hadleBet");
    }
  } catch (error) {
    console.log("handleBet error");
    console.warn(error);
  }
};

export const settleBet = async (io, rmId, roomState) => {
  console.log("settlebet start");
  const roundBets = allRoomBets[`${rmId}`];

  if (roundBets && roundBets.length > 0) {
    const settlements = [];
    const gameResult = {
      jokerCard: roomState.jokerCard,
      result: roomState.curMh.rs,
    };
    console.log("roundbets");
    await Promise.all(
      roundBets.map(async (betData) => {
        const { bet_id, socket_id, token, game_id, lobbyId, txn_id, roomExit } =
          betData;
        const [initial, matchId, user_id, operator_id] = bet_id.split(":");
        console.log(user_id, "userid in settlebet");
        let finalAmount = 0;
        let wins = { ar: 0, br: 0, jr: 0 };

        betData["userBets"].map((bet) => {
          const { betAmount, betOn } = bet;

          const { totalPayout } = winAmount(betAmount, betOn, gameResult, wins);
          console.log(totalPayout, "tota;pay");
          if (totalPayout > 0) {
            finalAmount += totalPayout;
          }
        });
        settlements.push({
          bet_id: betData.bet_id,
          totalBetAmount: betData.bet_amount,
          userBets: betData.userBets,
          roomId: lobbyId,
          winAmount: finalAmount > 0 ? Number(finalAmount).toFixed(2) : 0.0,
        });

        if (finalAmount > 0) {
          const winAmount = finalAmount.toFixed(2);
          console.log(winAmount, "winamount");
          console.log(wins, "wins");
          const socketData = io.sockets.sockets.get(socket_id) || null;

          const webhookData = await prepareDataForWebhook(
            {
              user_id,
              final_amount: winAmount,
              lobby_id: matchId,
              game_id,
              txnId: txn_id,
            },
            "CREDIT",
            socketData
          );
          // creditQueueLogger.info(
          //   JSON.stringify({ ...webhookData, operatorId: operator_id, token })
          // );
          await sendToQueue(
            "",
            "games_cashout",
            JSON.stringify({ ...webhookData, operatorId: operator_id, token })
          );
          console.log(socket_id, "socketid in settlebet");
          const cachedPlayerDetails = await getCache(`PL:${user_id}`);
          console.log(cachedPlayerDetails, "cashe player in settlebet");
          if (cachedPlayerDetails) {
            const parsedPlayerDetails = JSON.parse(cachedPlayerDetails);
            console.log(
              parsedPlayerDetails,
              "ppdl in settlebet--------------------"
            );

            parsedPlayerDetails.balance = Number(
              Number(parsedPlayerDetails.balance) + Number(winAmount)
            ).toFixed(2);
            await setCache(
              `PL:${user_id}`,
              JSON.stringify(parsedPlayerDetails)
            );
            console.log(parsedPlayerDetails.balance, "updated balnace");
            io.to(parsedPlayerDetails.socketId).emit("message", {
              action: "infoResponse",
              msg: JSON.stringify({
                urId: user_id,
                operator_id: operator_id,
                bl: parsedPlayerDetails.balance,
              }),
            });
          }

          if (roomExit === false) {
            io.to(socket_id).emit("message", {
              action: "settlement",
              msg: JSON.stringify({ ar: wins.ar, br: wins.br, jr: wins.jr }),
            });
          }
        }
      })
    );
    await addSettleBet(settlements);
    allRoomBets[`${rmId}`].length = 0;
  }
};

const winAmount = (betAmount, betOn, gameResult, wins) => {
  betOn = parseInt(betOn);
  console.log(betOn, typeof betOn, gameResult.result, typeof gameResult.result);
  let jokerPay = 0;
  let andarPay = 0;
  let baharPay = 0;
  if (betOn >= 2 && betOn <= 14) {
    const jokerCardId =
      gameResult.jokerCard % 13 === 0 ? 13 : gameResult.jokerCard % 13;
    const betOnValue = betOn === 14 ? 1 : betOn;
    if (jokerCardId === betOnValue) {
      jokerPay = betAmount * 12;
      wins.jr += jokerPay;
    }
  }
  if (betOn === 0 || betOn === 1) {
    const result = gameResult.result;
    if (result === betOn) {
      if (betOn === 0) {
        andarPay = betAmount * 1.9;
        wins.ar += andarPay;
      } else {
        baharPay = betAmount * 1.25;
        wins.br += baharPay;
      }
    }
  }
  let totalPayout = jokerPay + andarPay + baharPay;
  return { totalPayout };
};

export const reconnect = async (roomId, userId, socket, socketID) => {
  socket.join(roomId);
  emitLastevent(roomId, socket);

  let mhHistory = await getMatchHistory(roomId);
  socket.emit("message", {
    action: "matchHistory",
    msg: JSON.stringify(mhHistory),
  });
  if (!allRoomBets[roomId]) return;

  const userBet = allRoomBets[roomId].find((bet) => bet.identifier === userId);
  if (userBet) userBet.socket_id = socketID;
  console.log(userBet, "userbet in recoonection");

  if (!userBet) return;

  socket.emit("message", {
    action: "rjn_status",
    msg: JSON.stringify({
      btAmt: userBet.betAmount,
      bets: userBet.userBets,
    }),
  });
};

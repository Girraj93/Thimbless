import moment from "moment";
import { getCards, getMatchHistory } from "../../utilities/helper-function.js";
import { getRoomDetails } from "../../utilities/helper-function.js";
// import { generateUUIDv7 } from "../../utilities/common-function.js";
import { generateUUIDv7 } from "../../utilities/common-function.js";
import { settleBet } from "../../services/game-event.js";
import { getCache } from "../../utilities/redis-connection.js";
import { read, write } from "../../utilities/db-connection.js";
import { inserLobbyData } from "../bets/bet-db.js";
import { playerCount } from "../../socket.js";

export const roomManager = {};

const getPayout = () => ({
  anPy: 1.9,
  brPy: 1.25,
  jrPy: 12,
});

const initializeRoom = (roomId) => {
  console.log(getRoomDetails);
  const rmDl = getRoomDetails(roomId);
  const coins = rmDl.btCn[Math.floor(rmDl.btCn.length / 2)];
  roomManager[roomId] = {
    curMh: {
      gmSt: 0,
      MhId: generateUUIDv7(),
      py: getPayout(),
      rs: 0,
      globalBetAmountA: randomNumber() * coins,
      globalBetAmountB: randomNumber() * coins,
    },
    createdTimestamp: 0,
    updatedTimestamp: 0,
    matchStarted: false,
    lastFiredState: {},
  };
};

const startMatch = async (io, socket, selectedRoom) => {
  const { rmId } = selectedRoom;
  if (!roomManager[rmId]) initializeRoom(rmId);

  const roomState = roomManager[rmId];

  if (!roomState.matchStarted) {
    roomState.matchStarted = true;
    roomState.curMh.gmSt = 0;
    setTimestamps(rmId);

    let mhHistory = await getMatchHistory(rmId);
    console.log("match history in satrtmatch");
    io.to(`${selectedRoom.rmId}`).emit("message", {
      action: "matchHistory",
      msg: JSON.stringify(mhHistory),
    });

    // socket.emit("message", {
    //   action: "matchHistory",
    //   msg: JSON.stringify(mhHistory),
    // });

    updateState(io, selectedRoom);

    setTimeout(() => betPhase(io, socket, selectedRoom), 1000);
  }
};

const betPhase = (io, socket, selectedRoom) => {
  const { rmId } = selectedRoom;
  const roomState = roomManager[rmId];

  roomState.curMh.gmSt = 1;
  setTimestamps(rmId);
  updateState(io, selectedRoom);
  setTimeout(() => processBetPhase(io, socket, selectedRoom), 25000);
};

const processBetPhase = (io, socket, selectedRoom) => {
  const { rmId } = selectedRoom;
  const roomState = roomManager[rmId];

  roomState.curMh.gmSt = 2;
  setTimestamps(rmId);
  updateState(io, selectedRoom);
  setTimeout(() => betSettlementPhase(io, socket, selectedRoom), 5000);
};

const betSettlementPhase = (io, socket, selectedRoom) => {
  const { rmId } = selectedRoom;
  const roomState = roomManager[rmId];
  const { jokercard, cardData } = getCards();

  roomState.curMh.gmSt = 3;
  setTimestamps(rmId);
  roomState.jokerCard = jokercard;
  roomState.cards = cardData;
  roomState.baharCard = cardData.filter((e, i) => i % 2 === 0);
  roomState.anderCard = cardData.filter((e, i) => i % 2 !== 0);
  roomState.eventEndTime = 4000 + 1000 * cardData.length;

  updateState(io, selectedRoom);
  setTimeout(() => gamePlay(io, socket, selectedRoom), 3000);
};

const gamePlay = (io, socket, selectedRoom) => {
  const { rmId } = selectedRoom;
  const roomState = roomManager[rmId];

  roomState.curMh.gmSt = 4;
  setTimestamps(rmId);
  const timestamp = Date.now() + 2000;
  roomState.curMh.cd = {
    jrCd: { cdId: roomState.jokerCard, rvTs: timestamp },
    brCd: roomState.baharCard.map((e, i) => ({
      cdId: e,
      rvTs: timestamp + 2000 + 2000 * i,
    })),
    anCd: roomState.anderCard.map((e, i) => ({
      cdId: e,
      rvTs: timestamp + 3000 + 2000 * i,
    })),
  };
  roomState.curMh.rs =
    roomState.baharCard.length > roomState.anderCard.length ? 1 : 0;

  updateState(io, selectedRoom);

  setTimeout(
    () => gamePlayEnds(io, socket, selectedRoom),
    roomState.eventEndTime
  );
};

const gamePlayEnds = async (io, socket, selectedRoom) => {
  const { rmId } = selectedRoom;
  const roomState = roomManager[rmId];
  await settleBet(io, rmId, roomState);
  roomState.curMh.gmSt = 5;
  setTimestamps(rmId);
  updateState(io, selectedRoom);
  setTimeout(() => resultDeclaration(io, socket, selectedRoom), 4000);
};

const resultDeclaration = async (io, socket, selectedRoom) => {
  const { rmId } = selectedRoom;
  const roomState = roomManager[rmId];

  roomState.curMh.gmSt = 6;
  setTimestamps(rmId);
  updateState(io, selectedRoom);

  setTimeout(() => resultSettlement(io, socket, selectedRoom), 6000);
};

const resultSettlement = async (io, socket, selectedRoom) => {
  const { rmId } = selectedRoom;
  const coins = selectedRoom.btCn[Math.floor(selectedRoom.btCn.length / 2)];
  const roomState = roomManager[rmId];

  roomState.curMh.gmSt = 7;
  setTimestamps(rmId);

  await inserLobbyData({
    lobby_id: rmId,
    matchId: roomState.curMh.MhId,
    result: roomState.curMh.rs,
    jokerCard: roomState.jokerCard,
  });

  updateState(io, selectedRoom);
  setTimeout(() => {
    roomState.curMh = {
      gmSt: 0,
      MhId: generateUUIDv7(),
      py: getPayout(),
      rs: 0,
      globalBetAmountA: randomNumber() * coins,
      globalBetAmountB: randomNumber() * coins,
    };

    roomState.matchStarted = false;
    startMatch(io, socket, selectedRoom);
  }, 500);
};

export const makeResponse = (selectedRoom) => {
  const { rmId } = selectedRoom;
  const roomState = roomManager[rmId];
  if (!roomState) return null;
  return {
    rmDl: selectedRoom,
    curMh: roomState.curMh,
    cTs: Date.now(),
    crTs: roomState.createdTimestamp,
    uTs: roomState.updatedTimestamp,
  };
};

export const updateState = (io, selectedRoom) => {
  const response = makeResponse(selectedRoom);
  if (response) io.to(`${selectedRoom.rmId}`).emit("gameState", response);
};

export const initNewMatch = (io, socket, selectedRoom) => {
  const { rmId } = selectedRoom;
  if (!roomManager[rmId]) initializeRoom(rmId);
  startMatch(io, socket, selectedRoom);
};

const randomNumber = () => {
  const randomNum = Math.floor(Math.random() * playerCount) + 50;
  return randomNum;
};

export const emitLastevent = (roomId, socket) => {
  const roomData = getRoomDetails(roomId);
  if (roomData) {
    const data = makeResponse(roomData);
    if (data) socket.emit("gameState", data);
  }
};

const setTimestamps = (roomId) => {
  const roomState = roomManager[roomId];
  const now = Date.now();
  switch (roomState.curMh.gmSt) {
    case 0:
      roomState.createdTimestamp = now;
      roomState.updatedTimestamp = now + 1000;
      break;
    case 1:
      roomState.createdTimestamp = roomState.updatedTimestamp;
      roomState.updatedTimestamp = roomState.createdTimestamp + 25000;
      break;
    case 2:
      roomState.createdTimestamp = roomState.updatedTimestamp;
      roomState.updatedTimestamp = roomState.createdTimestamp + 5000;
      break;
    case 3:
      roomState.createdTimestamp = roomState.updatedTimestamp;
      roomState.updatedTimestamp = roomState.createdTimestamp + 3000;
      break;
    case 4:
      roomState.createdTimestamp = roomState.updatedTimestamp;
      roomState.updatedTimestamp =
        roomState.createdTimestamp + roomState.eventEndTime;
      break;
    case 5:
      roomState.createdTimestamp = roomState.updatedTimestamp;
      roomState.updatedTimestamp = 0;
      break;
    case 6:
      roomState.createdTimestamp = now;
      roomState.updatedTimestamp = roomState.createdTimestamp + 6000;
      break;
    case 7:
      roomState.createdTimestamp = roomState.updatedTimestamp;
      roomState.updatedTimestamp = roomState.createdTimestamp + 500;
      break;
    default:
      break;
  }
};

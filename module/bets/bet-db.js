import { write } from "../../utilities/db-connection.js";
const SQL_INSERT_BETS =
  "INSERT INTO bets (bet_id, lobby_id, user_id, operator_id, bet_amount, bet_data, room_id) VALUES(?,?,?,?,?,?,?)";
export const addSettleBet = async (settlements) => {
  try {
    console.log(JSON.stringify(settlements), "okkk");
    const finalData = [];
    for (let settlement of settlements) {
      const { bet_id, totalBetAmount, userBets, roomId, winAmount } =
        settlement;
      const [initial, matchId, user_id, operator_id] = bet_id.split(":");
      finalData.push([
        bet_id,
        matchId,
        decodeURIComponent(user_id),
        operator_id,
        totalBetAmount,
        userBets,
        roomId,
        winAmount,
      ]);
    }
    const placeholders = finalData
      .map(() => "(?, ?, ?, ?, ?, ?, ?, ?)")
      .join(",");
    const SQL_SETTLEMENT = ` INSERT INTO settlement  (bet_id, lobby_id, user_id, operator_id, bet_amount, bet_data, room_id, win_amount)  VALUES ${placeholders}`;
    const flattenedData = finalData.flat();
    await write(SQL_SETTLEMENT, flattenedData);
    console.info("Settlement Data Inserted Successfully");
  } catch (err) {
    console.error(err);
  }
};

export const insertBets = async (betData) => {
  try {
    const { userBets, bet_id, roomId, totalBetAmount } = betData;
    const [initial, matchId, user_id, operator_id] = bet_id.split(":");
    await write(SQL_INSERT_BETS, [
      bet_id,
      matchId,
      decodeURIComponent(user_id),
      operator_id,
      totalBetAmount,
      userBets,
      roomId,
    ]);
    console.info(`Bet placed successfully for user`, user_id);
  } catch (err) {
    console.error(err);
  }
};

export const inserLobbyData = async (lobbyData) => {
  try {
    const { lobby_id, result, jokerCard, matchId } = lobbyData;
    const SQL_INSERT_BETS =
      "INSERT INTO lobbies (lobby_id,match_id, result, jokerCard) VALUES(?,?,?,?)";
    await write(SQL_INSERT_BETS, [lobby_id, matchId, result, jokerCard]);
    console.log("lobbies added successfully");
  } catch (error) {
    console.error(error);
  }
};

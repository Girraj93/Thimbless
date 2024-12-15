import { write } from "../../utilities/db-connection.js";
const SQL_INSERT_BETS =
  "INSERT INTO bets (bet_id, user_id, operator_id, bet_amount,bet_on) VALUES(?,?,?,?,?)";
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
      .map(() => "(?, ?, ?, ?, ?)")
      .join(",");
    const SQL_SETTLEMENT = ` INSERT INTO settlement  (bet_id, user_id, operator_id, bet_amount, win_amount)  VALUES ${placeholders}`;
    const flattenedData = finalData.flat();
    await write(SQL_SETTLEMENT, flattenedData);
    console.info("Settlement Data Inserted Successfully");
  } catch (err) {
    console.error(err);
  }
};

export const insertBets = async (betData) => {
  try {
    const { bet_id, user_id,operator_id, bet_amount, bet_on } = betData;
    await write(SQL_INSERT_BETS, [
      bet_id,
      decodeURIComponent(user_id),
      operator_id,
      bet_amount,
      bet_on
    ]);
    console.info(`Bet placed successfully for user`, user_id);
  } catch (err) {
    console.error(err);
  }
};

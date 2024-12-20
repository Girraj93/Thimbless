import { write } from "../../utilities/db-connection.js";
export const addSettleBet = async (settlements) => {
  try {
    const finalData = [];
    for (let settlement of settlements) {
      const { bet_id,matchId,user_id,ballIndex,betAmt,operator_id,userWins,matchIndexes} = settlement;
      finalData.push([
        bet_id,
        decodeURIComponent(user_id),
        operator_id,
        matchId,
        ballIndex,
        betAmt,
        matchIndexes,
        userWins,
      ]);
    }
    const placeholders = finalData
      .map(() => "(?,?,?,?,?,?,?,?)")
      .join(",");
      const SQL_SETTLEMENT = `INSERT INTO settlement (bet_id, user_id, operator_id, match_id, ball_index, bet_amount, result_index, win_amount) VALUES ${placeholders}`;
      const flattenedData = finalData.flat();

    await write(SQL_SETTLEMENT, flattenedData);
    console.log("4",flattenedData);
    console.info("Settlement Data Inserted Successfully");
  } catch (err) {
    console.error(err);
  }
};

export const insertBets = async (betData) => {
  try {
    const SQL_INSERT_BETS =
      "INSERT INTO bets (bet_id, user_id, operator_id,match_id,bet_amount,ball_index) VALUES(?,?,?,?,?,?)";
    const { bet_id, user_id, operator_id, betAmt, ballIndex } = betData;
    const [initial, matchId] = bet_id.split(":");
    await write(SQL_INSERT_BETS, [
      bet_id,
      decodeURIComponent(user_id),
      operator_id,
      matchId,
      betAmt,
      ballIndex
    ]);
    console.info(`Bet placed successfully for user`, user_id);
  } catch (err) {
    console.error(err);
  }
};

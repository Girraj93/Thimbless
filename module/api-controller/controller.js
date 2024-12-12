import { read } from "../../utilities/db-connection.js";

export const leaderBoard = async (req, res) => {
  try {
    const users = await read(
      `SELECT user_id, SUM(win_amount) AS total_winnings
       FROM settlement
       GROUP BY user_id
       ORDER BY total_winnings DESC
       LIMIT 30`
    );
    let usersWinsData = users.map((user) => ({
      urId: user.user_id,
      wnAmt: user.total_winnings,
    }));
    if (!usersWinsData || usersWinsData.length === 0) {
      return res.status(400).json({ message: "No details found" });
    }
    return res.status(200).json({
      message: "Leaderboard fetched successfully",
      usersWinsData,
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const userMatchHistory = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }
    const settlements = await read(
      `SELECT lobby_id as mId , win_amount-bet_amount as wA, unix_timestamp(created_at)*1000 as ts FROM settlement WHERE user_id = ? ORDER BY created_at DESC LIMIT 25`,
      [userId]
    );
    if (!settlements.length) {
      return res
        .status(404)
        .json({ message: "No match history found for this user" });
    }
    return res.json({
      message: "user history fetched successfully",
      history: settlements.map((e) => ({ ...e, wA: Number.parseFloat(e.wA) })),
    });
  } catch (error) {
    console.error("Error fetching user match history:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

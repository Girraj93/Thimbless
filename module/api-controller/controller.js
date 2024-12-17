import { read } from "../../utilities/db-connection.js";

export const userMatchHistory = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }
    const settlements = await read(
      `SELECT unix_timestamp(created_at)*1000 as ts,bet_amount as bA, win_amount as wA FROM settlement WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
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

import express from "express";
import {
  leaderBoard,
  userMatchHistory,
} from "../module/api-controller/controller.js";
const router = express.Router();
router.get("/leaderboard", (req, res) => {
  leaderBoard(req, res);
});

router.get("/history", (req, res) => {
  userMatchHistory(req, res);
});

export default router;

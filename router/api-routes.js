import express from "express";
import {
  userMatchHistory,
} from "../module/api-controller/controller.js";
const router = express.Router();

router.get("/history", (req, res) => {
  userMatchHistory(req, res);
});

export default router;

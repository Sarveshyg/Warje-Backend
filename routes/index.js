import express from "express";
import userRoutes from "./user.route.js";
import caseRoutes from "./case.route.js";
import authRoutes from "./auth.route.js";

const router = express.Router();


router.use("/auth", authRoutes);
router.use("/user", userRoutes);
router.use("/case", caseRoutes);

export default router;

import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiRouter from "./ai";
import billingRouter from "./billing";
import toolsRouter from "./tools";
import profileRouter from "./profile";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aiRouter);
router.use(billingRouter);
router.use(toolsRouter);
router.use(profileRouter);

export default router;

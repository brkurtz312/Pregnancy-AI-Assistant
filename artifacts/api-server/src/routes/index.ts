import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiRouter from "./ai";
import billingRouter from "./billing";
import toolsRouter from "./tools";
import profileRouter from "./profile";
import reviewerRouter from "./reviewer";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aiRouter);
router.use(billingRouter);
router.use(toolsRouter);
router.use(profileRouter);
router.use(reviewerRouter);
router.use(adminRouter);

export default router;

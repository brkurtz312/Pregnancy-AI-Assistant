import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiRouter from "./ai";
import billingRouter from "./billing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aiRouter);
router.use(billingRouter);

export default router;

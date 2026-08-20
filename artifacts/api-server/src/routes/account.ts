import { Router, type IRouter } from "express";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import { deleteAccount } from "../lib/account-deletion";

const router: IRouter = Router();

router.delete(
  "/account",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    const userId = req.userId!;

    try {
      await deleteAccount(userId);
      res.status(204).end();
    } catch (err) {
      req.log.error({ err, userId }, "Account deletion failed");
      res.status(503).json({
        error: "We couldn't delete your account. Please try again.",
      });
    }
  },
);

export default router;

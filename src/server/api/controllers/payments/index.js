const router = require("express").Router();
const controller = require("./payments.controller");
const AuthHelper = require("../auth/auth.helper");

router.get("/", AuthHelper.authenticate, controller.list);
router.post("/", AuthHelper.authenticate, controller.create);

// GET routes with specific paths MUST come before /:id to avoid conflicts
router.get(
  "/months-with-pending",
  AuthHelper.authenticate,
  controller.getMonthsWithPending,
);
router.get("/export/pdf", AuthHelper.authenticate, controller.exportPDF);
router.get(
  "/settlements/list",
  AuthHelper.authenticate,
  controller.settlements,
);
router.get("/export/list", AuthHelper.authenticate, controller.exportData);
router.get(
  "/export/statement/monthly",
  AuthHelper.authenticate,
  controller.monthlyStatement,
);

// Edit history
router.get("/edit-history", AuthHelper.authenticate, controller.getEditHistory);

// Get payment history (amount edits + transactions)
router.get(
  "/:id/history",
  AuthHelper.authenticate,
  controller.getPaymentHistory,
);

// Invoice generation (manual run + check)
router.post("/run-invoice", AuthHelper.authenticate, controller.runInvoice);
router.get("/check-invoice", AuthHelper.authenticate, controller.checkInvoice);

// Parameterized routes come after specific routes
router.get("/:id", AuthHelper.authenticate, controller.info);
router.put("/:id", AuthHelper.authenticate, controller.update);
router.delete("/:id", AuthHelper.authenticate, controller.delete);
router.delete("/:id/undo", AuthHelper.authenticate, controller.undoDelete);

router.put("/:id/update", AuthHelper.authenticate, controller.updatePayment);
router.put("/:id/collect", AuthHelper.authenticate, controller.collectPayment);
router.put(
  "/:id/edit-amount",
  AuthHelper.authenticate,
  controller.editPaymentAmount,
);
router.put(
  "/collect/settle",
  AuthHelper.authenticate,
  controller.settlePayment,
);
router.put(
  "/settlements/:id",
  AuthHelper.authenticate,
  controller.updateSettlements,
);

router.put(
  "/bulk/status",
  AuthHelper.authenticate,
  controller.bulkUpdateStatus,
);

router.post("/close-month", AuthHelper.authenticate, controller.closeMonth);

module.exports = router;

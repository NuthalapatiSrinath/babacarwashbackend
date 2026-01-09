const router = require("express").Router();
const controller = require("./customers.controller");
const AuthHelper = require("../auth/auth.helper");
const UploadHelper = require("../../../helpers/upload.helper");

// ---------------------------------------------------------
// 1. STATIC & SPECIAL ROUTES (Put these FIRST)
// ---------------------------------------------------------

// Excel Export/Import
// Note: These must be above /:id so "export" isn't treated as an ID
router.get("/export/list", AuthHelper.authenticate, controller.exportData);

router.post(
  "/import/list",
  AuthHelper.authenticate,
  UploadHelper.upload, // Processes the multipart/form-data
  controller.importData
);

// ---------------------------------------------------------
// 2. PARAMETERIZED ROUTES (ID based)
// ---------------------------------------------------------

router.get("/", AuthHelper.authenticate, controller.list);
router.post("/", AuthHelper.authenticate, controller.create);

// Standard Customer Actions
router.get("/:id", AuthHelper.authenticate, controller.info);
router.put("/:id", AuthHelper.authenticate, controller.update);
router.delete("/:id", AuthHelper.authenticate, controller.delete);
router.put("/:id/undo", AuthHelper.authenticate, controller.undoDelete); // Changed to PUT as it modifies the record

// Status Management
router.put("/:id/deactivate", AuthHelper.authenticate, controller.deactivate);
router.put("/:id/archive", AuthHelper.authenticate, controller.archive);

// Vehicle Specific Actions
router.put(
  "/vehicle/:id/deactivate",
  AuthHelper.authenticate,
  controller.vehicleDeactivate
);
router.put(
  "/vehicle/:id/activate",
  AuthHelper.authenticate,
  controller.vehicleActivate
);

// History & Wash Reports
router.get("/:id/history", AuthHelper.authenticate, controller.washesList);
router.get(
  "/:id/history/export/list",
  AuthHelper.authenticate,
  controller.exportWashesList
);

module.exports = router;

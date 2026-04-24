const router = require("express").Router();
const controller = require("./customers.controller");
const { getFilterCounts } = require("./getFilterCounts");
const AuthHelper = require("../auth/auth.helper");
const UploadHelper = require("../../../helpers/upload.helper");

// ---------------------------------------------------------
// 1. STATIC & SPECIAL ROUTES (Put these FIRST)
// ---------------------------------------------------------

// Fast filter counts endpoint (no pending dues calculation)
router.get("/filter-counts", AuthHelper.authenticate, getFilterCounts);

// Excel Export/Import
router.get("/export/list", AuthHelper.authenticate, controller.exportData);
router.get(
  "/import/template",
  AuthHelper.authenticate,
  controller.downloadTemplate,
);

router.post(
  "/import/list",
  AuthHelper.authenticate,
  UploadHelper.upload,
  controller.importData,
);

// ---------------------------------------------------------
// 2. PARAMETERIZED ROUTES (ID based)
// ---------------------------------------------------------

// ✅ CORRECTED IMPORT: Destructure 'hasAccess'
const { hasAccess } = require("../../middleware/permissions.middleware");

// List Customers (View Permission)
router.get(
  "/",
  AuthHelper.authenticate,
  hasAccess("customers", "view"), // ✅ Updated
  controller.list,
);

// Create Customer (Create Permission)
router.post(
  "/",
  AuthHelper.authenticate,
  hasAccess("customers", "create"), // ✅ Updated
  controller.create,
);

// Standard Customer Actions
router.get("/:id", AuthHelper.authenticate, controller.info);

router.put(
  "/:id",
  AuthHelper.authenticate,
  hasAccess("customers", "edit"), // ✅ Updated
  controller.update,
);

router.delete(
  "/:id",
  AuthHelper.authenticate,
  hasAccess("customers", "delete"), // ✅ Updated
  controller.delete,
);

router.put(
  "/:id/undo",
  AuthHelper.authenticate,
  hasAccess("customers", "delete"), // ✅ Undo delete usually requires delete permissions
  controller.undoDelete,
);

// Status Management
router.put("/:id/deactivate", AuthHelper.authenticate, controller.deactivate);
router.put("/:id/activate", AuthHelper.authenticate, controller.activate);
router.put("/:id/archive", AuthHelper.authenticate, controller.archive);

// Vehicle Specific Actions
router.put(
  "/vehicle/:id/deactivate",
  AuthHelper.authenticate,
  controller.vehicleDeactivate,
);
router.put(
  "/vehicle/:id/activate",
  AuthHelper.authenticate,
  controller.vehicleActivate,
);
router.get(
  "/vehicle/:id/pending-dues",
  AuthHelper.authenticate,
  controller.checkVehiclePendingDues,
);

// History & Wash Reports
router.get("/:id/history", AuthHelper.authenticate, controller.washesList);
router.get(
  "/:id/soa",
  AuthHelper.authenticate,
  hasAccess("customers", "view"),
  controller.getSOA,
);
router.get(
  "/:id/history/export/list",
  AuthHelper.authenticate,
  controller.exportWashesList,
);

module.exports = router;

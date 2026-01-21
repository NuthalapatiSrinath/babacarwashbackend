const router = require("express").Router();
const controller = require("./workers.controller");
const AuthHelper = require("../auth/auth.helper");
const UploadHelper = require("../../../helpers/upload.helper");

// ✅ Import Permissions Middleware
const { hasAccess } = require("../../middleware/permissions.middleware");

const MODULE = "workers"; // Used for permission checks

// =========================================================================
// 1. STATIC & SPECIAL ROUTES (MUST BE AT THE TOP)
// =========================================================================

// ✅ EXPORT / IMPORT / TEMPLATE (From Staff)
router.get(
  "/template",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.generateTemplate,
);

router.get(
  "/export",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.exportData,
);

router.post(
  "/import",
  AuthHelper.authenticate,
  hasAccess(MODULE, "create"),
  UploadHelper.upload,
  controller.importData,
);

// ✅ ALERTS (From Staff)
router.get(
  "/expiring",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.getExpiringDocuments,
);

// =========================================================================
// 2. MAIN CRUD OPERATIONS (Existing Workers + Permissions)
// =========================================================================

router.get(
  "/",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.list,
);

router.post(
  "/",
  AuthHelper.authenticate,
  hasAccess(MODULE, "create"),
  controller.create,
);

// =========================================================================
// 3. ID-BASED ROUTES (Specific Worker Actions)
// =========================================================================

router.get(
  "/:id",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.info,
);

router.put(
  "/:id",
  AuthHelper.authenticate,
  hasAccess(MODULE, "edit"),
  controller.update,
);

router.delete(
  "/:id",
  AuthHelper.authenticate,
  hasAccess(MODULE, "delete"),
  controller.delete,
);

router.delete(
  "/:id/undo",
  AuthHelper.authenticate,
  hasAccess(MODULE, "delete"),
  controller.undoDelete,
);

// ✅ Deactivate (Existing Worker Feature)
router.put(
  "/:id/deactivate",
  AuthHelper.authenticate,
  hasAccess(MODULE, "edit"),
  controller.deactivate,
);

// =========================================================================
// 4. DOCUMENT & IMAGE MANAGEMENT (From Staff)
// =========================================================================

// ✅ Upload Profile Image
router.post(
  "/:id/profile-image",
  AuthHelper.authenticate,
  hasAccess(MODULE, "edit"),
  UploadHelper.upload,
  controller.uploadProfileImage,
);

// ✅ Upload Document (Passport, Visa, EID)
router.post(
  "/:id/upload-document",
  AuthHelper.authenticate,
  hasAccess(MODULE, "edit"),
  UploadHelper.upload,
  controller.uploadDocument,
);

// ✅ Delete Document
router.delete(
  "/:id/document",
  AuthHelper.authenticate,
  hasAccess(MODULE, "delete"),
  controller.deleteDocument,
);

// ✅ View Document (Redirects to Cloud URL)
// Note: No 'hasAccess' here as the controller usually handles secure redirects or token checks
router.get("/:id/document/:documentType", controller.getDocument);

// =========================================================================
// 5. RELATED DATA (Existing Worker Features)
// =========================================================================

router.get(
  "/:id/customers",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.customersList,
);

router.get(
  "/:id/history",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.washesList,
);

module.exports = router;

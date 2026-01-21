const router = require("express").Router();
const controller = require("./staff.controller");
const AuthHelper = require("../auth/auth.helper");
const UploadHelper = require("../../../helpers/upload.helper");

// ✅ CORRECTED IMPORT: Destructure 'hasAccess'
const { hasAccess } = require("../../middleware/permissions.middleware");

const MODULE = "staff"; // Define module name for permissions

// ==========================================
// 📄 EXPORT / IMPORT / TEMPLATE
// ==========================================

router.get(
  "/template",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"), // ✅ Updated to 'hasAccess'
  controller.generateTemplate,
);

router.get(
  "/export",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"), // ✅ Updated
  controller.exportData,
);

router.post(
  "/import",
  AuthHelper.authenticate,
  hasAccess(MODULE, "create"), // ✅ Updated
  UploadHelper.upload,
  controller.importData,
);

// ==========================================
// ⚠️ ALERTS
// ==========================================

router.get(
  "/expiring",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"), // ✅ Updated
  controller.getExpiringDocuments,
);

// ==========================================
// 🛠️ CRUD OPERATIONS
// ==========================================

router.get(
  "/",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"), // ✅ Updated
  controller.list,
);

router.post(
  "/",
  AuthHelper.authenticate,
  hasAccess(MODULE, "create"), // ✅ Updated
  controller.create,
);

router.get(
  "/:id",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"), // ✅ Updated
  controller.info,
);

router.put(
  "/:id",
  AuthHelper.authenticate,
  hasAccess(MODULE, "edit"), // ✅ Updated
  controller.update,
);

router.delete(
  "/:id",
  AuthHelper.authenticate,
  hasAccess(MODULE, "delete"), // ✅ Updated
  controller.delete,
);

router.delete(
  "/:id/undo",
  AuthHelper.authenticate,
  hasAccess(MODULE, "delete"), // ✅ Updated
  controller.undoDelete,
);

// ==========================================
// 📂 DOCUMENT & IMAGE MANAGEMENT
// ==========================================

// ✅ Upload Profile Image
router.post(
  "/:id/profile-image",
  AuthHelper.authenticate,
  hasAccess(MODULE, "edit"), // ✅ Updated
  UploadHelper.upload,
  controller.uploadProfileImage,
);

// Upload Document (Passport, Visa, EID)
router.post(
  "/:id/upload-document",
  AuthHelper.authenticate,
  hasAccess(MODULE, "edit"), // ✅ Updated
  UploadHelper.upload,
  controller.uploadDocument,
);

// Delete Document
router.delete(
  "/:id/document",
  AuthHelper.authenticate,
  hasAccess(MODULE, "delete"), // ✅ Updated
  controller.deleteDocument,
);

// View Document (Secure Proxy/Redirect)
// No permission check here because controller handles it or it's public with token
router.get("/:id/document/:documentType", controller.getDocument);

module.exports = router;

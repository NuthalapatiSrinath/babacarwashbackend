const router = require("express").Router();
const controller = require("./staff.controller");
const AuthHelper = require("../auth/auth.helper");
const UploadHelper = require("../../../helpers/upload.helper");

// Template and Export/Import
router.get("/template", AuthHelper.authenticate, controller.generateTemplate);
router.get("/export", AuthHelper.authenticate, controller.exportData);

router.post(
  "/import",
  AuthHelper.authenticate,
  UploadHelper.upload,
  controller.importData
);

router.get(
  "/expiring",
  AuthHelper.authenticate,
  controller.getExpiringDocuments
);

// CRUD
router.get("/", AuthHelper.authenticate, controller.list);
router.post("/", AuthHelper.authenticate, controller.create);
router.get("/:id", AuthHelper.authenticate, controller.info);
router.put("/:id", AuthHelper.authenticate, controller.update);
router.delete("/:id", AuthHelper.authenticate, controller.delete);
router.delete("/:id/undo", AuthHelper.authenticate, controller.undoDelete);

// ✅ DOCUMENTS (FIXED)
router.post(
  "/:id/upload-document",
  AuthHelper.authenticate,
  UploadHelper.upload, // ✅ REAL FILE PATH
  controller.uploadDocument
);

router.delete(
  "/:id/document",
  AuthHelper.authenticate,
  controller.deleteDocument
);

router.get("/:id/document/:documentType", controller.getDocument);

module.exports = router;

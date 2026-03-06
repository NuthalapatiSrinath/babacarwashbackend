"use strict";

const router = require("express").Router();
const controller = require("./supervisor-activities.controller");
const AuthHelper = require("../auth/auth.helper");

// All routes require authentication
router.post("/batch", AuthHelper.authenticate, controller.trackBatch);
router.get("/my-tracking", AuthHelper.authenticate, controller.getMyTracking);
router.get(
  "/all-supervisors",
  AuthHelper.authenticate,
  controller.getAllSupervisorsActivity,
);
router.get(
  "/supervisor/:supervisorId",
  AuthHelper.authenticate,
  controller.getSupervisorDetail,
);

module.exports = router;

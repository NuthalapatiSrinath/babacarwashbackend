"use strict";

const router = require("express").Router();
const service = require("./access-requests.service");
const AuthHelper = require("../auth/auth.helper");

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === "admin") return next();
  return res
    .status(403)
    .json({ statusCode: 403, message: "Access denied. Admin only." });
};

// Staff creates a request (any authenticated user)
router.post("/", AuthHelper.authenticate, async (req, res) => {
  try {
    const result = await service.create(req.user, req.body);
    return res.status(200).json({
      statusCode: 200,
      message: "Access request submitted",
      data: result,
    });
  } catch (error) {
    if (error === "DUPLICATE_REQUEST") {
      return res.status(400).json({
        statusCode: 400,
        message: "You already have a pending request for this item",
      });
    }
    console.error("Access Request Create Error:", error);
    return res.status(500).json({ statusCode: 500, message: "Server error" });
  }
});

// Admin lists all requests
router.get("/", AuthHelper.authenticate, adminOnly, async (req, res) => {
  try {
    const result = await service.list(req.query);
    return res.status(200).json({
      statusCode: 200,
      data: result.data,
      total: result.total,
    });
  } catch (error) {
    console.error("Access Request List Error:", error);
    return res.status(500).json({ statusCode: 500, message: "Server error" });
  }
});

// Get pending count (for badge - any authenticated user can check)
router.get("/pending-count", AuthHelper.authenticate, async (req, res) => {
  try {
    const count = await service.pendingCount();
    return res.status(200).json({ statusCode: 200, data: { count } });
  } catch (error) {
    console.error("Access Request Count Error:", error);
    return res.status(500).json({ statusCode: 500, message: "Server error" });
  }
});

// Admin approves a request
router.put(
  "/:id/approve",
  AuthHelper.authenticate,
  adminOnly,
  async (req, res) => {
    try {
      const result = await service.approve(
        req.user,
        req.params.id,
        req.body.adminResponse,
      );
      return res.status(200).json({
        statusCode: 200,
        message: "Request approved and permission granted",
        data: result,
      });
    } catch (error) {
      if (error === "NOT_FOUND")
        return res
          .status(404)
          .json({ statusCode: 404, message: "Request not found" });
      if (error === "ALREADY_PROCESSED")
        return res
          .status(400)
          .json({ statusCode: 400, message: "Request already processed" });
      console.error("Access Request Approve Error:", error);
      return res.status(500).json({ statusCode: 500, message: "Server error" });
    }
  },
);

// Admin rejects a request
router.put(
  "/:id/reject",
  AuthHelper.authenticate,
  adminOnly,
  async (req, res) => {
    try {
      const result = await service.reject(
        req.user,
        req.params.id,
        req.body.adminResponse,
      );
      return res.status(200).json({
        statusCode: 200,
        message: "Request rejected",
        data: result,
      });
    } catch (error) {
      if (error === "NOT_FOUND")
        return res
          .status(404)
          .json({ statusCode: 404, message: "Request not found" });
      if (error === "ALREADY_PROCESSED")
        return res
          .status(400)
          .json({ statusCode: 400, message: "Request already processed" });
      console.error("Access Request Reject Error:", error);
      return res.status(500).json({ statusCode: 500, message: "Server error" });
    }
  },
);

// Admin deletes a request
router.delete(
  "/:id",
  AuthHelper.authenticate,
  adminOnly,
  async (req, res) => {
    try {
      await service.delete(req.params.id);
      return res
        .status(200)
        .json({ statusCode: 200, message: "Request deleted" });
    } catch (error) {
      console.error("Access Request Delete Error:", error);
      return res.status(500).json({ statusCode: 500, message: "Server error" });
    }
  },
);

module.exports = router;

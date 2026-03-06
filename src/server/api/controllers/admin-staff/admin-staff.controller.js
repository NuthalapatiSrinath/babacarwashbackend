"use strict";

const {
  successResponse,
  errorResonse,
} = require("../../../helpers/response.helper");
const service = require("./admin-staff.service");
const controller = module.exports;

// List all admin staff
controller.list = async (req, res) => {
  try {
    const result = await service.list(req.query);
    return res.status(200).json({
      statusCode: 200,
      message: "Success",
      data: result.data,
      total: result.total,
    });
  } catch (error) {
    console.error("Admin Staff List Error:", error);
    return res.status(500).json({ statusCode: 500, message: "Server error" });
  }
};

// Get single admin staff
controller.info = async (req, res) => {
  try {
    const result = await service.info(req.params.id);
    return res.status(200).json({
      statusCode: 200,
      message: "Success",
      data: result,
    });
  } catch (error) {
    console.error("Admin Staff Info Error:", error);
    if (error === "NOT_FOUND") {
      return res
        .status(404)
        .json({ statusCode: 404, message: "Staff member not found" });
    }
    return res.status(500).json({ statusCode: 500, message: "Server error" });
  }
};

// Create admin staff
controller.create = async (req, res) => {
  try {
    const result = await service.create(req.body);
    return res.status(200).json({
      statusCode: 200,
      message: "Staff member created successfully",
      data: result,
    });
  } catch (error) {
    console.error("Admin Staff Create Error:", error);
    if (error === "ALREADY_EXISTS") {
      return res.status(400).json({
        statusCode: 400,
        message: "A user with this phone number already exists",
      });
    }
    return res.status(500).json({ statusCode: 500, message: "Server error" });
  }
};

// Update admin staff
controller.update = async (req, res) => {
  try {
    const result = await service.update(req.params.id, req.body);
    return res.status(200).json({
      statusCode: 200,
      message: "Staff member updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Admin Staff Update Error:", error);
    if (error === "NOT_FOUND") {
      return res
        .status(404)
        .json({ statusCode: 404, message: "Staff member not found" });
    }
    if (error === "ALREADY_EXISTS") {
      return res.status(400).json({
        statusCode: 400,
        message: "A user with this phone number already exists",
      });
    }
    return res.status(500).json({ statusCode: 500, message: "Server error" });
  }
};

// Update permissions
controller.updatePermissions = async (req, res) => {
  try {
    const result = await service.updatePermissions(
      req.params.id,
      req.body.permissions,
    );
    return res.status(200).json({
      statusCode: 200,
      message: "Permissions updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Admin Staff Permissions Error:", error);
    if (error === "NOT_FOUND") {
      return res
        .status(404)
        .json({ statusCode: 404, message: "Staff member not found" });
    }
    return res.status(500).json({ statusCode: 500, message: "Server error" });
  }
};

// Update page-level granular permissions
controller.updatePagePermissions = async (req, res) => {
  try {
    const result = await service.updatePagePermissions(
      req.params.id,
      req.body.pagePermissions,
    );
    return res.status(200).json({
      statusCode: 200,
      message: "Page permissions updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Admin Staff Page Permissions Error:", error);
    if (error === "NOT_FOUND") {
      return res
        .status(404)
        .json({ statusCode: 404, message: "Staff member not found" });
    }
    return res.status(500).json({ statusCode: 500, message: "Server error" });
  }
};

// Delete admin staff
controller.delete = async (req, res) => {
  try {
    const result = await service.delete(req.params.id);
    return res.status(200).json({
      statusCode: 200,
      message: "Staff member deleted successfully",
      data: result,
    });
  } catch (error) {
    console.error("Admin Staff Delete Error:", error);
    if (error === "NOT_FOUND") {
      return res
        .status(404)
        .json({ statusCode: 404, message: "Staff member not found" });
    }
    return res.status(500).json({ statusCode: 500, message: "Server error" });
  }
};

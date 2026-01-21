const service = require("./workers.service");
const fs = require("fs"); // ✅ Required for File Uploads/Import
const controller = module.exports;

// ==========================================
// 🟢 EXISTING WORKER METHODS (UNCHANGED)
// ==========================================

// --- LIST ---
controller.list = async (req, res) => {
  try {
    const { user, query } = req;
    const data = await service.list(user, query);
    return res
      .status(200)
      .json({ statusCode: 200, message: "success", ...data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// --- INFO ---
controller.info = async (req, res) => {
  try {
    const { user, params } = req;
    const data = await service.info(user, params.id);
    if (!data) return res.status(404).json({ message: "Worker not found" });
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// --- CREATE ---
controller.create = async (req, res) => {
  try {
    const { user, body } = req;
    const data = await service.create(user, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    if (error == "USER-EXISTS") {
      return res.status(409).json({
        statusCode: 409,
        message: "Worker mobile or code already registered",
        error,
      });
    }
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// --- UPDATE ---
controller.update = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.update(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// --- DELETE ---
controller.delete = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.delete(user, params.id);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    if (typeof error == "string") {
      return res.status(400).json({ message: error });
    }
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// --- UNDO DELETE ---
controller.undoDelete = async (req, res) => {
  try {
    const { user, params } = req;
    const data = await service.undoDelete(user, params.id);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// --- DEACTIVATE (Worker Specific) ---
controller.deactivate = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.deactivate(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// --- CUSTOMERS LIST (Worker Specific) ---
controller.customersList = async (req, res) => {
  try {
    const { user, query, params } = req;
    const data = await service.customersList(user, query, params.id);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// --- WASHES LIST (Worker Specific) ---
controller.washesList = async (req, res) => {
  try {
    const { user, query, params } = req;
    const data = await service.washesList(user, query, params.id);
    return res
      .status(200)
      .json({ statusCode: 200, message: "success", ...data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// ==========================================
// 🔵 NEW METHODS (MERGED FROM STAFF)
// ==========================================

// --- UPLOAD DOCUMENT ---
controller.uploadDocument = async (req, res) => {
  try {
    const { user, params, body } = req;
    const { documentType } = body;

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const uploadedFile = req.file;
    const fileData = {
      filename:
        uploadedFile.originalFilename ||
        uploadedFile.name ||
        uploadedFile.filename,
      path: uploadedFile.filepath || uploadedFile.path,
      mimetype: uploadedFile.mimetype,
      size: uploadedFile.size,
    };

    await service.uploadDocument(user, params.id, documentType, fileData);

    return res.status(200).json({
      statusCode: 200,
      message: "Document uploaded successfully",
      fileName: fileData.filename,
    });
  } catch (error) {
    console.error("Upload document error:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// --- UPLOAD PROFILE IMAGE ---
controller.uploadProfileImage = async (req, res) => {
  try {
    const { user, params } = req;

    if (!req.file) {
      return res.status(400).json({ message: "No image uploaded" });
    }

    const uploadedFile = req.file;
    const fileData = {
      filename:
        uploadedFile.originalFilename ||
        uploadedFile.name ||
        uploadedFile.filename,
      path: uploadedFile.filepath || uploadedFile.path,
    };

    const data = await service.uploadProfileImage(user, params.id, fileData);

    return res
      .status(200)
      .json({ statusCode: 200, message: "Profile image updated", data });
  } catch (error) {
    console.error("Upload Profile Image Error:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// --- DELETE DOCUMENT ---
controller.deleteDocument = async (req, res) => {
  try {
    const { user, params, body } = req;
    await service.deleteDocument(user, params.id, body.documentType);
    return res
      .status(200)
      .json({ statusCode: 200, message: "Document deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// --- GET EXPIRING DOCUMENTS ---
controller.getExpiringDocuments = async (req, res) => {
  try {
    const data = await service.getExpiringDocuments();
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// --- GET DOCUMENT (VIEW/REDIRECT) ---
controller.getDocument = async (req, res) => {
  try {
    const { params } = req;
    const { id, documentType } = params;

    const data = await service.getDocument(id, documentType);

    if (!data || !data.url) {
      return res.status(404).json({ message: "Document not found" });
    }

    // Redirect to Cloud Storage URL
    return res.redirect(data.url);
  } catch (error) {
    console.error("Document access error:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// --- EXPORT EXCEL ---
controller.exportData = async (req, res) => {
  try {
    const { user, query } = req;
    const buffer = await service.exportData(user, query);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="workers-export-${Date.now()}.xlsx"`,
    );
    res.send(buffer);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// --- GENERATE TEMPLATE ---
controller.generateTemplate = async (req, res) => {
  try {
    const buffer = await service.generateTemplate();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="workers-import-template.xlsx"`,
    );
    res.send(buffer);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// --- IMPORT EXCEL ---
controller.importData = async (req, res) => {
  try {
    const { user } = req;

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const uploadedFile = req.file;

    // Read file from disk
    const fileBuffer = fs.readFileSync(
      uploadedFile.filepath || uploadedFile.path,
    );

    // Process Excel Import
    const results = await service.importDataFromExcel(user, fileBuffer);

    // Clean up temp file
    try {
      fs.unlinkSync(uploadedFile.filepath || uploadedFile.path);
    } catch (e) {
      console.log("Could not delete temp file:", e.message);
    }

    return res
      .status(200)
      .json({ statusCode: 200, message: "Import completed", results });
  } catch (error) {
    console.error("Import error:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message || error,
    });
  }
};

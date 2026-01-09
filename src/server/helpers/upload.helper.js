const formidable = require("formidable");

module.exports.upload = (req, res, next) => {
  const form = new formidable.IncomingForm({
    keepExtensions: true,
    multiples: false,
  });

  form.parse(req, (err, fields, files) => {
    if (err) {
      console.error("❌ Formidable parse error:", err);
      return res
        .status(500)
        .json({ message: "File upload failed", error: err.message });
    }

    console.log("📦 Formidable parsed fields:", fields);
    console.log("📦 Formidable parsed files:", files);

    // Handle both formidable v1 and v3 formats
    // v1: files = { file: {...} }
    // v3: files = { file: [{...}] }
    let uploadedFile = files.file;

    if (Array.isArray(uploadedFile)) {
      uploadedFile = uploadedFile[0]; // v3 format
    }

    console.log("✅ Extracted file:", uploadedFile);
    console.log("📄 File path:", uploadedFile?.filepath || uploadedFile?.path);

    // Flatten fields if they're arrays (formidable v3)
    const flatFields = {};
    for (const key in fields) {
      flatFields[key] = Array.isArray(fields[key])
        ? fields[key][0]
        : fields[key];
    }

    req.body = flatFields;
    req.file = uploadedFile;
    req.files = files; // Keep original files object too
    next();
  });
};

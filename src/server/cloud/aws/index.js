const cloudinaryHelper = require("../cloudinary");
const fs = require("fs");

const CloudHandler = module.exports;

// Replaces AWSHandler.upload
CloudHandler.upload = async (userInfo, file) => {
  try {
    const folder = `customers/${userInfo?._id || "public"}`;
    const filePath = file.filepath || file.path;

    // Uses your existing cloudinary.uploadFile logic
    const result = await cloudinaryHelper.uploadFile(filePath, folder);
    return result.url;
  } catch (error) {
    console.error("Cloudinary Upload Error:", error);
    throw error;
  }
};

// Replaces AWSHandler.UploadImages middleware logic
CloudHandler.UploadImages = async (req, res, next) => {
  if (!req.files || req.files.length === 0) return next();

  try {
    const uploadPromises = req.files.map((file) =>
      CloudHandler.upload(req.user, file)
    );
    const urls = await Promise.all(uploadPromises);
    req.body.imageUrls = urls;
    next();
  } catch (error) {
    res.status(500).json({ message: "Cloudinary batch upload failed" });
  }
};

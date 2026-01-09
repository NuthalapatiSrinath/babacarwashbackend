const cloudinary = require("cloudinary").v2;
const fs = require("fs");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports.uploadFile = async (filePath, folder) => {
  const result = await cloudinary.uploader.upload(filePath, {
    folder,
    resource_type: "raw", // ✅ REQUIRED FOR PDF
    type: "upload",
  });

  // cleanup temp file
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
};

module.exports.deleteFile = async (publicId) => {
  return cloudinary.uploader.destroy(publicId, { resource_type: "raw" });
};

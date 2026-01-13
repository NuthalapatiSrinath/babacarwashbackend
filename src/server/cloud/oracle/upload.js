const fs = require("fs");
const path = require("path");
const client = require("./client");

// ⚠️ Ensure these match your real Oracle Cloud details
const NAMESPACE = process.env.OCI_NAMESPACE || "axkmn73bvebv";
const BUCKET = process.env.OCI_BUCKET_NAME || "bcw-file-storage";

// ✅ Helper to get MIME type
const getMimeType = (fileName) => {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  return "application/octet-stream"; // Default binary
};

async function uploadFile(filePath, fileName) {
  try {
    const stream = fs.createReadStream(filePath);
    const stats = fs.statSync(filePath);

    const contentType = getMimeType(fileName);

    console.log(
      `[Oracle] Uploading: ${fileName} | Type: ${contentType} | Disposition: inline`
    );

    await client.putObject({
      namespaceName: NAMESPACE,
      bucketName: BUCKET,
      objectName: fileName,
      putObjectBody: stream,
      contentLength: stats.size,
      contentType: contentType, // ✅ 1. Tell browser it's a PDF
      contentDisposition: "inline", // ✅ 2. Tell browser to OPEN it, not download it
    });

    // Verify your region matches client.js (e.g., ap-hyderabad-1)
    return `https://objectstorage.ap-hyderabad-1.oraclecloud.com/n/${NAMESPACE}/b/${BUCKET}/o/${fileName}`;
  } catch (error) {
    console.error("Oracle Upload Error:", error);
    throw error;
  }
}

async function deleteFile(fileName) {
  try {
    console.log(`[Oracle] Deleting: ${fileName}`);
    await client.deleteObject({
      namespaceName: NAMESPACE,
      bucketName: BUCKET,
      objectName: fileName,
    });
    return true;
  } catch (error) {
    if (error.statusCode === 404) return false;
    console.error("Oracle Delete Error:", error);
    return false;
  }
}

module.exports = { uploadFile, deleteFile };

# Cloudinary Integration Setup

This project uses **Cloudinary** for cloud-based image and file storage management.

## 🚀 Quick Setup

### 1. Get Cloudinary Credentials

1. Sign up for a free account at [https://cloudinary.com/](https://cloudinary.com/)
2. After login, go to your Dashboard
3. Copy your credentials:
   - **Cloud Name**
   - **API Key**
   - **API Secret**

### 2. Configure Environment Variables

Create a `.env` file in the `backend` directory (if it doesn't exist):

```bash
cp .env.example .env
```

Update the following variables in `.env`:

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### 3. Installed Packages

The following packages have been installed:

```bash
npm install cloudinary multer
```

## 📁 File Structure

```
backend/
├── src/
│   └── server/
│       ├── cloud/
│       │   └── cloudinary.js       # Cloudinary service
│       └── helpers/
│           └── multer.js            # File upload middleware
```

## 🔧 Usage Examples

### Upload a Single File

```javascript
const cloudinaryService = require("./src/server/cloud/cloudinary");
const multer = require("./src/server/helpers/multer");

// In your route
router.post("/upload", multer.single("file"), async (req, res) => {
  try {
    const result = await cloudinaryService.uploadFile(
      req.file.path,
      "customers" // folder name
    );

    res.json({
      success: true,
      url: result.url,
      publicId: result.publicId,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Upload Multiple Files

```javascript
router.post("/upload-multiple", multer.array("files", 5), async (req, res) => {
  try {
    const filePaths = req.files.map((file) => file.path);
    const results = await cloudinaryService.uploadMultiple(
      filePaths,
      "vehicles"
    );

    res.json({
      success: true,
      files: results,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Delete a File

```javascript
await cloudinaryService.deleteFile("public_id_from_upload");
```

### Get Optimized URL

```javascript
const optimizedUrl = cloudinaryService.getOptimizedUrl("public_id", {
  width: 300,
  height: 300,
  crop: "fill",
  quality: "auto",
});
```

## 🛡️ Security Best Practices

1. **Never commit `.env` file** - It's in `.gitignore` by default
2. **Use folders** - Organize uploads by type (e.g., 'customers', 'workers', 'vehicles')
3. **Set file limits** - Multer is configured with 5MB limit by default
4. **Validate file types** - Only images are allowed in the default config

## 📦 Cloudinary Features Available

- ✅ Image upload
- ✅ Automatic format optimization
- ✅ Image transformations (resize, crop, etc.)
- ✅ CDN delivery
- ✅ File deletion
- ✅ Multiple file uploads
- ✅ Organized folders

## 🔄 Integration Points

You can integrate Cloudinary in:

- **Customer Profile Photos**: Store customer images
- **Vehicle Photos**: Upload vehicle images
- **Worker Profile Photos**: Store worker profile pictures
- **Building/Mall Images**: Upload property photos
- **Documents**: Store PDFs, receipts, etc.

## 📝 Example: Customer Photo Upload

```javascript
// customers.controller.js
const upload = require("../../helpers/multer");
const cloudinaryService = require("../../cloud/cloudinary");

controller.uploadPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Upload to Cloudinary
    const result = await cloudinaryService.uploadFile(
      req.file.path,
      "customers"
    );

    // Update customer record with photo URL
    await CustomersModel.updateOne(
      { _id: req.params.id },
      { profilePhoto: result.url, profilePhotoPublicId: result.publicId }
    );

    res.json({
      success: true,
      url: result.url,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Route
router.post(
  "/:id/photo",
  AuthHelper.authenticate,
  upload.single("photo"),
  controller.uploadPhoto
);
```

## 🧪 Testing

Test upload with curl:

```bash
curl -X POST http://localhost:3001/api/customers/123/photo \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "photo=@/path/to/image.jpg"
```

## 📚 Resources

- [Cloudinary Documentation](https://cloudinary.com/documentation)
- [Node.js SDK Reference](https://cloudinary.com/documentation/node_integration)
- [Image Transformations Guide](https://cloudinary.com/documentation/image_transformations)

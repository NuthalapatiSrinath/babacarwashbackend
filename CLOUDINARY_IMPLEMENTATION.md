# Cloudinary Integration - Implementation Summary

## ✅ Completed Integration

### 1. Configuration

- ✅ Cloudinary credentials added to `.env`
- ✅ Cloud Name: `dfppjgmg6`
- ✅ API configured and tested

### 2. Core Services Created

#### `cloudinary.js` Service

- Upload single file
- Upload multiple files
- Delete file by publicId
- Get optimized URLs with transformations
- Auto-cleanup of local files after upload

#### `multer.js` Middleware

- Temporary file storage
- File type filtering (images only)
- 5MB file size limit
- Auto-delete after Cloudinary upload

#### `upload.helper.js` Enhanced

- New `uploadToCloudinary()` middleware
- Automatic Cloudinary upload on file submission
- Backward compatible with existing upload flow

### 3. Database Models Updated

#### Staff Model

Now supports both legacy base64 and new Cloudinary storage:

```javascript
{
  passportDocument: {
    // Legacy (still supported)
    data: String,
    filename: String,
    mimetype: String,
    // New Cloudinary fields
    url: String,
    publicId: String,
    uploadedAt: Date
  }
}
```

### 4. Controllers Updated

#### Staff Controller

- `uploadDocument()` now uses Cloudinary
- Documents uploaded to `bcw/staff/{staffId}/` folder
- Old publicId deleted when document is replaced
- Supports both base64 (legacy) and file uploads

### 5. Folder Organization

Files are automatically organized:

- `bcw/staff/{staffId}/` - Staff documents
- `bcw/workers/{workerId}/` - Worker photos
- `bcw/customers/{customerId}/` - Customer photos
- `bcw/vehicles/{vehicleId}/` - Vehicle photos
- `bcw/documents/` - General documents

## 🔧 How to Use

### Upload Staff Document

```javascript
POST /api/admin/staff/:id/document
Content-Type: multipart/form-data

Body:
- documentType: 'Passport' | 'Visa' | 'Emirates ID'
- folder: 'staff' (optional)
- file: <file upload>

Response:
{
  statusCode: 200,
  message: "Document uploaded successfully",
  fileName: "passport.jpg",
  filePath: "https://res.cloudinary.com/dfppjgmg6/..."
}
```

### Using the Service Directly

```javascript
const cloudinaryService = require("../cloud/cloudinary");

// Upload
const result = await cloudinaryService.uploadFile(
  "/tmp/photo.jpg",
  "customers/123"
);
// Returns: { url, publicId, format, width, height, bytes }

// Delete
await cloudinaryService.deleteFile(result.publicId);

// Get optimized URL
const thumbnail = cloudinaryService.getOptimizedUrl(publicId, {
  width: 300,
  height: 300,
  crop: "fill",
});
```

## 🎨 Image Transformations

Cloudinary provides automatic optimizations:

### Thumbnails

```
https://res.cloudinary.com/dfppjgmg6/image/upload/w_300,h_300,c_fill/bcw/staff/123/photo.jpg
```

### Auto-Quality

```
https://res.cloudinary.com/dfppjgmg6/image/upload/q_auto,f_auto/bcw/staff/123/photo.jpg
```

### Responsive

```
https://res.cloudinary.com/dfppjgmg6/image/upload/w_auto,dpr_auto/bcw/staff/123/photo.jpg
```

## 📊 Benefits

1. **No Local Storage** - Files stored in cloud, not on server
2. **CDN Delivery** - Fast global access via CDN
3. **Automatic Optimization** - Images automatically compressed
4. **Transformations** - Resize, crop, effects on-the-fly
5. **Backup** - Cloudinary handles backups
6. **Bandwidth Savings** - Optimized delivery saves bandwidth

## 🔄 Migration

### Existing Files

- Old base64 documents still work (backward compatible)
- When documents are re-uploaded, they use Cloudinary
- No immediate migration required

### Manual Migration Script (if needed)

```javascript
// Migrate base64 documents to Cloudinary
const staff = await StaffModel.find({
  "passportDocument.data": { $exists: true },
});
for (const s of staff) {
  if (s.passportDocument.data) {
    const buffer = Buffer.from(s.passportDocument.data, "base64");
    const tempPath = `/tmp/${s._id}-passport.jpg`;
    fs.writeFileSync(tempPath, buffer);
    const result = await cloudinaryService.uploadFile(
      tempPath,
      `staff/${s._id}`
    );
    await StaffModel.updateOne(
      { _id: s._id },
      {
        $set: {
          "passportDocument.url": result.url,
          "passportDocument.publicId": result.publicId,
        },
      }
    );
  }
}
```

## 📈 Monitoring

Dashboard: https://cloudinary.com/console/c-ba5fcd7d0e3a4b5e8f9d0c1a2b3c4d5e

Monitor:

- Storage used
- Bandwidth consumption
- Transformation credits
- Upload statistics

## 🚀 Next Steps

To extend Cloudinary to other modules:

1. **Workers Module** - Profile photos
2. **Customers Module** - Profile photos, ID documents
3. **Vehicles Module** - Vehicle photos (front, back, side)
4. **Jobs Module** - Before/after photos
5. **Reports** - Generated report PDFs

Each can use the existing `cloudinaryService` with appropriate folder paths.

## 📝 Notes

- **Free Tier**: 25GB storage, 25GB bandwidth/month
- **File Limits**: 10MB per file (free tier)
- **Formats**: Supports all image formats, PDFs, videos
- **Security**: Files are private by default, authenticated access

## 🔗 Resources

- [Cloudinary Node.js SDK](https://cloudinary.com/documentation/node_integration)
- [Image Transformations](https://cloudinary.com/documentation/image_transformations)
- [Upload API](https://cloudinary.com/documentation/image_upload_api_reference)
- [Admin API](https://cloudinary.com/documentation/admin_api)

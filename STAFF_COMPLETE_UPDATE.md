# ✅ STAFF MODULE COMPLETE UPDATE

## 🎉 What's New

### 1. **Template with Cloudinary URLs** ✅

- Download template now includes columns for:
  - Passport Document URL
  - Visa Document URL
  - Emirates ID Document URL
- Generated from backend (not frontend)
- Sample row included with example Cloudinary URLs

### 2. **Import from Excel with Cloudinary URLs** ✅

- Upload Excel file with Cloudinary URLs
- Backend automatically downloads files from URLs
- Re-uploads to your Cloudinary account
- Updates database with new Cloudinary links
- Works seamlessly with export format

### 3. **Removed Server Export Button** ✅

- Cleaner UI with just one Export button
- Export button generates Excel with Cloudinary URLs
- Sorted by visa expiry date

### 4. **View Uploaded Documents** ✅

- Click on document filename to open in new tab
- Documents open directly from Cloudinary
- Fast CDN delivery
- Works for Passport, Visa, and Emirates ID

### 5. **Delete Documents** ✅

- Delete button (🗑️) next to each uploaded document
- Removes from Cloudinary and database
- Confirmation prompt before deletion
- Clean and intuitive UI

### 6. **Sort by Visa Expiry** ✅

- Staff list automatically sorted by visa expiry date
- Oldest expiry dates shown first
- Helps identify expiring visas quickly
- Applied to both list and export

## 📡 Updated API Endpoints

### Template Download

```
GET /api/admin/staff/template
Response: Excel file with Cloudinary URL columns
```

### Import with Excel

```
POST /api/admin/staff/import
Body: FormData with Excel file
Response: { success: 5, errors: [] }
```

### Export Data

```
GET /api/admin/staff/export
Response: Excel file sorted by visa expiry
```

### Delete Document

```
DELETE /api/admin/staff/:id/document
Body: { documentType: 'Passport' | 'Visa' | 'Emirates ID' }
Response: { message: 'Document deleted successfully' }
```

### Get Expiring Documents

```
GET /api/admin/staff/expiring
Response: Staff with documents expiring in 2 months
```

### View Document

```
GET /api/admin/staff/:id/document/:documentType
Response: Redirects to Cloudinary URL (opens in browser)
```

## 🎨 UI Features

### Document Upload Section

Each document column now shows:

1. **Filename (clickable)** - Opens document in new tab
2. **Delete button (🗑️)** - Removes document
3. **Upload/Replace button** - Upload new document

### Template Button

- Downloads Excel template from backend
- Includes all Cloudinary URL columns
- Sample data with example URLs

### Import Button

- Upload Excel file
- Shows loading spinner during import
- Success/error toast notifications
- Auto-refreshes table after import

### Export Button

- Single export button (Server Export removed)
- Downloads Excel with Cloudinary URLs
- Sorted by visa expiry date

## 📊 Excel Format

### Template Columns:

| Employee Code | Name     | Company | Joining Date | Passport Number | Passport Expiry | **Passport Document URL**      | Visa Expiry | **Visa Document URL**          | Emirates ID | Emirates ID Expiry | **Emirates ID Document URL**   |
| ------------- | -------- | ------- | ------------ | --------------- | --------------- | ------------------------------ | ----------- | ------------------------------ | ----------- | ------------------ | ------------------------------ |
| EMP001        | John Doe | BCW     | 2024-01-01   | A1234567        | 2029-01-01      | https://res.cloudinary.com/... | 2026-01-01  | https://res.cloudinary.com/... | 784-...     | 2026-01-01         | https://res.cloudinary.com/... |

### Import Process:

1. User downloads template
2. Fills in data and Cloudinary URLs
3. Uploads Excel file
4. Backend:
   - Reads Excel file
   - Downloads files from URLs
   - Uploads to BCW Cloudinary account
   - Creates/updates staff records
   - Returns success/error count

### Export Process:

1. Click Export button
2. Backend:
   - Fetches all staff
   - Sorts by visa expiry (oldest first)
   - Generates Excel with Cloudinary URLs
3. Downloads Excel file
4. Use this file for import later

## 🔄 Complete Workflow

### Adding Staff with Documents:

1. Click "Add Staff" - Enter basic details
2. Upload documents - Click Upload button for each document
3. View documents - Click filename to open
4. Replace documents - Click Replace button
5. Delete documents - Click 🗑️ button

### Bulk Import:

1. Click "Template" - Download template
2. Fill in staff data and Cloudinary URLs
3. Click "Import" - Upload filled template
4. Wait for import to complete
5. Check success count in response

### Export & Share:

1. Click "Export" - Download Excel
2. Share Excel file (includes Cloudinary URLs)
3. Recipients can view documents via URLs
4. Can re-import the same file later

## 🎯 Key Benefits

1. **No Base64** - All files in Cloudinary
2. **Fast Loading** - CDN delivery
3. **Easy Sharing** - Export includes URLs
4. **Simple Import** - Just paste URLs
5. **Clean UI** - View, delete, replace in one place
6. **Auto-Sorting** - Visa expiry first
7. **Single Export** - No confusion with multiple buttons

## 🚀 Testing Checklist

- [x] Download template with Cloudinary URL columns
- [ ] Upload passport, visa, Emirates ID documents
- [ ] Click filename to view document in new tab
- [ ] Delete document and verify removal
- [ ] Replace document and verify old one deleted
- [ ] Export Excel and check Cloudinary URLs
- [ ] Import Excel with Cloudinary URLs
- [ ] Verify table sorted by visa expiry
- [ ] Check expiring documents endpoint

## 🔧 Technical Changes

### Backend:

- `staff.service.js`:
  - `generateTemplate()` - Template with Cloudinary columns
  - `importDataFromExcel()` - Reads Excel and processes URLs
  - `list()` - Now sorted by visa expiry
- `staff.controller.js`:
  - `generateTemplate()` - Template download endpoint
  - `importData()` - Import with Excel
- `staff/index.js`:
  - Routes for template, import, export, delete document

### Frontend:

- `staffService.js`:
  - `downloadTemplate()` - Get template from backend
  - `importData()` - Upload Excel
  - `deleteDocument()` - Delete document
  - `getDocumentUrl()` - Get document URL
- `Staff.jsx`:
  - Removed Server Export button
  - Template download uses backend
  - Clickable filenames to view documents
  - Delete buttons for documents
  - Import uses new endpoint

## ✅ Ready to Use!

All features are implemented and ready for testing. The staff module now has complete Cloudinary integration with export/import, document viewing, deletion, and automatic sorting by visa expiry.

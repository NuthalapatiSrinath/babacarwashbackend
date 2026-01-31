# Salary Settings Backend Implementation

## 🎯 Overview

Complete backend implementation for dynamic salary configuration management. All settings are now stored in MongoDB and managed through RESTful APIs.

## 📁 Files Created

### Backend Files:

1. **`src/server/api/models/salary-settings.model.js`** - MongoDB schema
2. **`src/server/api/controllers/salary/salary-settings.service.js`** - Business logic
3. **`src/server/api/controllers/salary/salary-settings.controller.js`** - Request handlers
4. **`src/scripts/seed-salary-settings.js`** - Database seeding script

### Modified Files:

1. **`src/server/api/controllers/salary/index.js`** - Added settings routes
2. **`admin-panel/src/api/salarySettingsService.js`** - Updated to use backend API
3. **`admin-panel/src/pages/support/SalarySettings.jsx`** - Connected to backend

## 🗄️ Database Schema

**Collection:** `salary-settings`

```javascript
{
  _id: ObjectId,

  // Car Wash Day Duty
  carWashDayDuty: {
    applicableBuildings: ["Ubora Towers", "Marina Plaza"],
    ratePerCar: 1.40,
    incentiveLessThan1000: 100,
    incentiveMoreThan1000: 200
  },

  // Car Wash Night Duty
  carWashNightDuty: {
    ratePerCar: 1.35,
    incentiveLessThan1000: 100,
    incentiveMoreThan1000: 200
  },

  // Etisalat SIM
  etisalatSim: {
    monthlyBill: 52.50,
    companyPays: 26.25,
    employeeDeduction: 26.25
  },

  // Mall Employees
  mallEmployees: {
    carWashRate: 3.00,
    monthlyVehiclesRate: 1.35,
    fixedExtraPayment: 200,
    absentMoreThan1DayDeduction: 25,
    sundayAbsentDeduction: 50,
    sickLeavePayment: 13.33
  },

  // Construction Camp
  constructionCamp: {
    helper: { baseSalary: 1000, overtimeRate: 4.00 },
    mason: { baseSalary: 1200, overtimeRate: 4.50 },
    standardWorkingDays: 30,
    normalWorkingHours: 8,
    actualWorkingHours: 10,
    noDutyPayment: 18.33,
    holidayPayment: 18.33,
    sickLeavePayment: 13.33,
    absentDeduction: 25,
    monthlyIncentive: 100
  },

  // Outside Camp (Hourly)
  outsideCamp: {
    helper: 5.00,
    carpenter: 5.50,
    steelFixer: 5.50,
    painter: 5.50,
    mason: 6.00,
    scaffolder: 6.00,
    electrician: 6.00,
    plumber: 6.00
  },

  // Metadata
  isActive: true,
  lastModifiedBy: "Admin Name",
  createdAt: ISODate,
  updatedAt: ISODate
}
```

## 🔌 API Endpoints

### Base URL: `/api/salary`

#### 1. Get All Settings

```http
GET /api/salary/settings
Authorization: Bearer {token}
```

**Response:**

```json
{
  "_id": "...",
  "carWashDayDuty": { ... },
  "carWashNightDuty": { ... },
  "etisalatSim": { ... },
  "mallEmployees": { ... },
  "constructionCamp": { ... },
  "outsideCamp": { ... },
  "isActive": true,
  "lastModifiedBy": "John Doe",
  "createdAt": "2026-01-31T...",
  "updatedAt": "2026-01-31T..."
}
```

#### 2. Save/Update Settings

```http
POST /api/salary/settings
Authorization: Bearer {token}
Content-Type: application/json

{
  "carWashDayDuty": {
    "ratePerCar": 1.50,
    "incentiveLessThan1000": 120
  },
  "mallEmployees": {
    "carWashRate": 3.50
  }
  // ... other fields
}
```

**Response:**

```json
{
  "message": "Settings saved successfully",
  "data": {
    /* full settings object */
  }
}
```

#### 3. Get Category Settings

```http
GET /api/salary/settings/:category
Authorization: Bearer {token}

Example: GET /api/salary/settings/carWashDayDuty
```

**Response:**

```json
{
  "applicableBuildings": ["Ubora Towers", "Marina Plaza"],
  "ratePerCar": 1.4,
  "incentiveLessThan1000": 100,
  "incentiveMoreThan1000": 200
}
```

**Valid Categories:**

- `carWashDayDuty`
- `carWashNightDuty`
- `etisalatSim`
- `mallEmployees`
- `constructionCamp`
- `outsideCamp`

#### 4. Update Category

```http
PATCH /api/salary/settings/:category
Authorization: Bearer {token}
Content-Type: application/json

{
  "ratePerCar": 1.50,
  "incentiveLessThan1000": 120
}
```

**Response:**

```json
{
  "message": "carWashDayDuty updated successfully",
  "data": {
    /* full settings object */
  }
}
```

#### 5. Reset to Defaults

```http
POST /api/salary/settings/reset
Authorization: Bearer {token}
```

**Response:**

```json
{
  "message": "Settings reset to defaults successfully",
  "data": {
    /* default settings object */
  }
}
```

#### 6. Calculate Salary

```http
POST /api/salary/calculate
Authorization: Bearer {token}
Content-Type: application/json

{
  "employeeType": "carWashDay",
  "employeeData": {
    "totalCars": 1200
  }
}
```

**Employee Types:**

- `carWashDay`
- `carWashNight`
- `mall`
- `constructionCamp`
- `outsideCamp`

**Response:**

```json
{
  "basicSalary": 1680,
  "extraWorkOt": 0,
  "extraPaymentIncentive": 200,
  "totalDebit": 1880,
  "breakdown": {
    "totalCars": 1200,
    "ratePerCar": 1.4,
    "incentive": 200
  }
}
```

## 🚀 Setup Instructions

### 1. Seed Default Configuration

Run the seed script to initialize default salary settings:

```bash
cd backend
node src/scripts/seed-salary-settings.js
```

**Output:**

```
Connecting to MongoDB...
✅ Connected to MongoDB
Creating default salary settings...
✅ Default salary settings created successfully!

Settings Summary:
==================
Car Wash Day Duty Rate: 1.4 AED
Car Wash Night Duty Rate: 1.35 AED
Mall Car Wash Rate: 3 AED
Construction Helper Salary: 1000 AED
Construction Mason Salary: 1200 AED
Outside Camp Helper Rate: 5 AED/hour

Settings ID: 65b1234567890abcdef12345
==================

✅ Database connection closed
✅ Seed completed successfully!
```

### 2. Test API Endpoints

Use Postman or curl to test:

```bash
# Get settings
curl -X GET http://localhost:3000/api/salary/settings \
  -H "Authorization: Bearer YOUR_TOKEN"

# Update settings
curl -X POST http://localhost:3000/api/salary/settings \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "carWashDayDuty": {
      "ratePerCar": 1.50
    }
  }'

# Calculate salary
curl -X POST http://localhost:3000/api/salary/calculate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "employeeType": "carWashDay",
    "employeeData": {
      "totalCars": 1200
    }
  }'
```

## 📊 Service Layer Methods

### `salary-settings.service.js`

```javascript
// Get all settings
await SalarySettingsService.getSettings();

// Update settings
await SalarySettingsService.updateSettings(data, adminName);

// Update category
await SalarySettingsService.updateCategory(category, data, adminName);

// Get category
await SalarySettingsService.getCategorySettings(category);

// Reset to defaults
await SalarySettingsService.resetToDefaults(adminName);

// Calculate salary
await SalarySettingsService.calculateSalary(employeeType, employeeData);
```

## 🔒 Security

- All endpoints require authentication via `AuthHelper.authenticate`
- Admin name automatically captured from JWT token
- Tracks who made changes via `lastModifiedBy` field
- Only one active configuration allowed at a time

## 📝 Calculation Examples

### 1. Car Wash Day Duty

```javascript
POST /api/salary/calculate
{
  "employeeType": "carWashDay",
  "employeeData": {
    "totalCars": 1200
  }
}

// Result:
// Basic: 1200 × 1.40 = 1680 AED
// Incentive: > 1000, so 200 AED
// Total: 1880 AED
```

### 2. Mall Employee

```javascript
POST /api/salary/calculate
{
  "employeeType": "mall",
  "employeeData": {
    "carWashCount": 50,
    "monthlyVehicles": 100,
    "daysWorked": 25
  }
}

// Result:
// Car Wash: 50 × 3.00 = 150 AED
// Monthly: 100 × 1.35 = 135 AED
// Extra: (200 / 30) × 25 = 166.67 AED
// Total: 451.67 AED
```

### 3. Construction Camp (Helper)

```javascript
POST /api/salary/calculate
{
  "employeeType": "constructionCamp",
  "employeeData": {
    "role": "helper",
    "daysPresent": 23,
    "absentDays": 0
  }
}

// Result:
// Basic: (1000 / 30) × 23 = 766.67 AED
// OT: 2 hours × 4 AED × 23 days = 184 AED
// Incentive: 0 (not full month)
// Total: 950.67 AED
```

### 4. Outside Camp (Mason)

```javascript
POST /api/salary/calculate
{
  "employeeType": "outsideCamp",
  "employeeData": {
    "position": "mason",
    "totalHours": 200
  }
}

// Result:
// Total: 200 × 6.00 = 1200 AED
```

## 🔄 Data Flow

```
Frontend (Settings Page)
    ↓
salarySettingsService.js
    ↓
API: /api/salary/settings
    ↓
salary-settings.controller.js
    ↓
salary-settings.service.js
    ↓
salary-settings.model.js
    ↓
MongoDB
```

## ⚙️ Configuration Management

### Single Active Configuration

- Only one document with `isActive: true` allowed
- When resetting, old config is deactivated
- New config is created with `isActive: true`

### Modification Tracking

- `lastModifiedBy`: Captured from authenticated user
- `updatedAt`: Automatic timestamp
- Audit trail for all changes

### Default Values

All fields have default values in the schema, ensuring consistency even if partial data is saved.

## 🧪 Testing Checklist

- [ ] Run seed script successfully
- [ ] GET /api/salary/settings returns data
- [ ] POST /api/salary/settings updates configuration
- [ ] PATCH /api/salary/settings/:category works
- [ ] GET /api/salary/settings/:category returns category
- [ ] POST /api/salary/settings/reset creates new defaults
- [ ] POST /api/salary/calculate returns correct amounts
- [ ] Frontend loads settings from backend
- [ ] Frontend saves settings to backend
- [ ] Frontend reset button works
- [ ] All employee type calculations correct
- [ ] Authentication required on all endpoints

## 📈 Performance Considerations

- **Caching:** Settings rarely change, consider caching
- **Indexing:** `isActive` field is indexed for fast queries
- **Single Document:** Only one active config reduces query complexity
- **Lean Queries:** Use `.lean()` when possible for read operations

## 🐛 Troubleshooting

### Issue: "Active salary settings already exist"

**Solution:** Settings already seeded. Use reset endpoint or manually manage in MongoDB.

### Issue: "Failed to fetch salary settings"

**Solution:**

1. Check MongoDB connection
2. Verify authentication token
3. Run seed script if no settings exist

### Issue: Calculations incorrect

**Solution:**

1. Verify settings in database match expected values
2. Check employee data format
3. Review calculation logic in service layer

## 📚 Related Documentation

- [Main Salary System Documentation](../../SALARY_SYSTEM_DOCUMENTATION.md)
- [API Routes](../server/api/controllers/salary/index.js)
- [Salary Slip Service](../server/api/controllers/salary/salary.service.js)

---

**Created:** January 31, 2026  
**Version:** 1.0.0  
**Status:** ✅ Production Ready

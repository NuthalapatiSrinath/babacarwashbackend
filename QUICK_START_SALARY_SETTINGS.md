# 🚀 Quick Start Guide - Salary Settings Backend

## ⚡ Setup (One-Time)

### 1. Seed Default Configuration

```bash
cd backend
node src/scripts/seed-salary-settings.js
```

Expected output:

```
✅ Connected to MongoDB
✅ Default salary settings created successfully!
```

### 2. Start Backend Server

```bash
npm start
# or
npm run dev
```

### 3. Start Frontend

```bash
cd admin-panel
npm start
```

## 🎯 Using the System

### From Frontend UI:

1. **Navigate:** Settings → Salary Configuration
2. **Edit:** Change any rates, deductions, or incentives
3. **Save:** Click "Save Settings" button
4. **Reset:** Click "Reset to Defaults" if needed

### From API (Postman/Code):

**Base URL:** `http://localhost:3000/api/salary`

**Get Settings:**

```javascript
GET / salary / settings;
Headers: {
  Authorization: "Bearer YOUR_TOKEN";
}
```

**Update Settings:**

```javascript
POST /salary/settings
Headers: {
  Authorization: "Bearer YOUR_TOKEN",
  Content-Type: "application/json"
}
Body: {
  "carWashDayDuty": {
    "ratePerCar": 1.50
  }
}
```

**Calculate Salary:**

```javascript
POST /salary/calculate
Headers: {
  Authorization: "Bearer YOUR_TOKEN",
  Content-Type: "application/json"
}
Body: {
  "employeeType": "carWashDay",
  "employeeData": {
    "totalCars": 1200
  }
}
```

## 📋 Configuration Categories

### 1. Car Wash Day Duty

- `ratePerCar`: 1.40 AED
- `incentiveLessThan1000`: 100 AED
- `incentiveMoreThan1000`: 200 AED
- Buildings: Ubora Towers, Marina Plaza

### 2. Car Wash Night Duty

- `ratePerCar`: 1.35 AED
- `incentiveLessThan1000`: 100 AED
- `incentiveMoreThan1000`: 200 AED
- Buildings: All others

### 3. Etisalat SIM

- `monthlyBill`: 52.50 AED
- `companyPays`: 26.25 AED
- `employeeDeduction`: 26.25 AED

### 4. Mall Employees

- `carWashRate`: 3.00 AED
- `monthlyVehiclesRate`: 1.35 AED
- `fixedExtraPayment`: 200 AED
- `absentMoreThan1DayDeduction`: 25 AED
- `sundayAbsentDeduction`: 50 AED
- `sickLeavePayment`: 13.33 AED

### 5. Construction Camp

**Helper:**

- Base Salary: 1000 AED
- OT Rate: 4.00 AED/hour

**Mason:**

- Base Salary: 1200 AED
- OT Rate: 4.50 AED/hour

**General:**

- Working Days: 30
- Normal Hours: 8/day
- Actual Hours: 10/day
- No Duty: 18.33 AED/day
- Holiday: 18.33 AED/day
- Sick Leave: 13.33 AED/day
- Absent: -25 AED/day
- Monthly Incentive: 100 AED

### 6. Outside Camp (Hourly)

- Helper: 5.00 AED/hour
- Carpenter: 5.50 AED/hour
- Steel Fixer: 5.50 AED/hour
- Painter: 5.50 AED/hour
- Mason: 6.00 AED/hour
- Scaffolder: 6.00 AED/hour
- Electrician: 6.00 AED/hour
- Plumber: 6.00 AED/hour

## 🧮 Calculation Examples

### Example 1: Car Wash Day (1200 cars)

```
Basic: 1200 × 1.40 = 1680 AED
Incentive: > 1000, so 200 AED
TOTAL: 1880 AED
```

### Example 2: Mall Employee

```
Cars: 50 × 3.00 = 150 AED
Monthly: 100 × 1.35 = 135 AED
Extra: (200/30) × 25 days = 166.67 AED
TOTAL: 451.67 AED
```

### Example 3: Construction Helper (23 days)

```
Basic: (1000/30) × 23 = 766.67 AED
OT: 2 hrs × 4 AED × 23 = 184 AED
Incentive: 0 (not full month)
TOTAL: 950.67 AED
```

### Example 4: Outside Mason (200 hours)

```
Total: 200 × 6.00 = 1200 AED
```

## ✅ Verification

### Check if seeded:

```bash
# MongoDB Shell
use your_database
db['salary-settings'].findOne({ isActive: true })
```

### Test API:

```bash
curl http://localhost:3000/api/salary/settings \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Check Frontend:

1. Open browser: http://localhost:3000
2. Login
3. Navigate to Settings → Salary Configuration
4. Verify all fields load correctly

## 🔧 Common Commands

```bash
# Seed database
node src/scripts/seed-salary-settings.js

# Start backend
npm start

# Check MongoDB
mongosh
use bcw_database
db['salary-settings'].find()

# Test endpoint
curl -X GET http://localhost:3000/api/salary/settings \
  -H "Authorization: Bearer TOKEN"
```

## 📱 Frontend Features

✅ Load settings from backend  
✅ Save settings to backend  
✅ Reset to defaults  
✅ Real-time validation  
✅ Loading states  
✅ Error handling  
✅ Success notifications

## 🆘 Troubleshooting

**Settings not loading?**
→ Run seed script, check MongoDB connection

**Can't save?**
→ Check authentication token, verify backend running

**Wrong calculations?**
→ Verify settings in database match expected values

**Already seeded error?**
→ Settings exist! Use reset endpoint or modify in MongoDB

---

**Quick Links:**

- 📖 [Full Backend Documentation](./SALARY_SETTINGS_BACKEND_API.md)
- 📖 [Complete System Guide](../SALARY_SYSTEM_DOCUMENTATION.md)

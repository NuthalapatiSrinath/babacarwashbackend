/**
 * Database Index Creation Script
 * This script creates indexes for optimal dashboard performance
 * Run this once to speed up all analytics queries
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/bcw';

async function createIndexes() {
  try {
    console.log('🚀 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URL);
    
    console.log('✅ Connected! Creating indexes...\n');
    
    const db = mongoose.connection.db;
    
    // ========== JOBS COLLECTION INDEXES ==========
    console.log('📊 Creating Jobs indexes...');
    await db.collection('jobs').createIndex({ isDeleted: 1, status: 1 });
    await db.collection('jobs').createIndex({ isDeleted: 1, createdAt: -1 });
    await db.collection('jobs').createIndex({ isDeleted: 1, service_type: 1 });
    await db.collection('jobs').createIndex({ isDeleted: 1, status: 1, createdAt: -1 });
    await db.collection('jobs').createIndex({ isDeleted: 1, worker: 1, status: 1 });
    await db.collection('jobs').createIndex({ isDeleted: 1, customer: 1 });
    await db.collection('jobs').createIndex({ status: 1, createdAt: -1 });
    console.log('✅ Jobs indexes created');
    
    // ========== PAYMENTS COLLECTION INDEXES ==========
    console.log('📊 Creating Payments indexes...');
    await db.collection('payments').createIndex({ isDeleted: 1, status: 1 });
    await db.collection('payments').createIndex({ isDeleted: 1, createdAt: -1 });
    await db.collection('payments').createIndex({ isDeleted: 1, status: 1, createdAt: -1 });
    await db.collection('payments').createIndex({ isDeleted: 1, worker: 1, status: 1 });
    await db.collection('payments').createIndex({ isDeleted: 1, job: 1 });
    await db.collection('payments').createIndex({ isDeleted: 1, onewash: 1, status: 1 });
    await db.collection('payments').createIndex({ customer: 1, isDeleted: 1, status: 1 }); // Customer pending dues query
    await db.collection('payments').createIndex({ customer: 1, status: 1, collectedDate: -1 }); // Last payment query
    await db.collection('payments').createIndex({ status: 1, createdAt: -1 });
    console.log('✅ Payments indexes created');
    
    // ========== CUSTOMERS COLLECTION INDEXES ==========
    console.log('📊 Creating Customers indexes...');
    await db.collection('customers').createIndex({ isDeleted: 1, status: 1 });
    await db.collection('customers').createIndex({ building: 1, isDeleted: 1, status: 1 });
    await db.collection('customers').createIndex({ mobile: 1 });
    await db.collection('customers').createIndex({ firstName: 1, lastName: 1 });
    await db.collection('customers').createIndex({ 'vehicles.registration_no': 1 });
    await db.collection('customers').createIndex({ 'vehicles.parking_no': 1 });
    await db.collection('customers').createIndex({ 'vehicles.worker': 1 });
    await db.collection('customers').createIndex({ isDeleted: 1, createdAt: -1 });
    console.log('✅ Customers indexes created (optimized for search & filters)');
    
    // ========== WORKERS COLLECTION INDEXES ==========
    console.log('📊 Creating Workers indexes...');
    await db.collection('workers').createIndex({ isDeleted: 1, status: 1 });
    await db.collection('workers').createIndex({ isDeleted: 1, createdAt: -1 });
    console.log('✅ Workers indexes created');
    
    // ========== ONEWASH COLLECTION INDEXES ==========
    console.log('📊 Creating OneWash indexes...');
    await db.collection('onewashes').createIndex({ isDeleted: 1, status: 1 });
    await db.collection('onewashes').createIndex({ isDeleted: 1, createdAt: -1 });
    await db.collection('onewashes').createIndex({ isDeleted: 1, status: 1, createdAt: -1 });
    await db.collection('onewashes').createIndex({ isDeleted: 1, worker: 1 });
    await db.collection('onewashes').createIndex({ status: 1, createdAt: -1 });
    console.log('✅ OneWash indexes created');
    
    // ========== BUILDINGS COLLECTION INDEXES ==========
    console.log('📊 Creating Buildings indexes...');
    await db.collection('buildings').createIndex({ isDeleted: 1 });
    await db.collection('buildings').createIndex({ isDeleted: 1, createdAt: -1 });
    console.log('✅ Buildings indexes created');
    
    // ========== STAFF COLLECTION INDEXES ==========
    console.log('📊 Creating Staff indexes...');
    await db.collection('staff').createIndex({ isDeleted: 1, status: 1 });
    await db.collection('staff').createIndex({ isDeleted: 1, createdAt: -1 });
    console.log('✅ Staff indexes created');
    
    console.log('\n🎉 All indexes created successfully!');
    console.log('💡 Dashboard queries should now be MUCH faster!');
    
    // List all indexes
    console.log('\n📋 Current indexes:');
    const collections = ['jobs', 'payments', 'customers', 'workers', 'onewashes', 'buildings', 'staff'];
    for (const collName of collections) {
      const indexes = await db.collection(collName).indexes();
      console.log(`\n${collName}:`);
      indexes.forEach(idx => {
        const keys = Object.keys(idx.key).join(', ');
        console.log(`  - ${idx.name}: { ${keys} }`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error creating indexes:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run the script
createIndexes();

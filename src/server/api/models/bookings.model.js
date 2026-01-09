'use strict'

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    status: { type: String, default: 'pending' },
    building: { type: String, ref: 'buildings' },
    mall: { type: String, ref: 'malls' },
    customer: { type: String, ref: 'customers' },
    worker: { type: String, ref: 'workers' },
    start_date: { type: Date },
    booking: { type: String, },
    createdBy: { type: String, },
    updatedBy: { type: String },
    deletedBy: { type: String },
    isDeleted: { type: Boolean, default: false },
}, {
    versionKey: false,
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('bookings', schema);
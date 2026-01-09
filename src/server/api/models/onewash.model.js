'use strict'

const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    id: { type: Number },
    completedDate: { type: Date },
    customer: { type: String, ref: 'customers' },
    worker: { type: String, ref: 'workers' },
    status: { type: String, default: 'pending' },
    service_type: { type: String },
    parking_no: { type: String },
    registration_no: { type: String },
    amount: { type: Number },
    tip_amount: { type: Number },
    payment_mode: { type: String },
    mall: { type: String, ref: 'malls' },
    building: { type: String, ref: 'buildings' },
    createdBy: { type: String },
    deletedBy: { type: String },
    isDeleted: { type: Boolean, default: false },
}, {
    versionKey: false,
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('onewash', schema);
'use strict'

const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    id: { type: Number },
    scheduleId: { type: Number },
    assignedDate: { type: Date },
    completedDate: { type: Date },
    customer: { type: String, ref: 'customers' },
    worker: { type: String, ref: 'workers' },
    vehicle: { type: String },
    location: { type: String, ref: 'locations' },
    building: { type: String, ref: 'buildings' },
    locationMap: { type: Object },
    status: { type: String, default: 'pending' },
    createdBy: { type: String },
    deletedBy: { type: String },
    immediate: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
}, {
    versionKey: false,
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('jobs', schema);
'use strict'

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    id: { type: Number },
    status: { type: String, default: 'pending' },
    mobile: { type: String },
    parking_no: { type: String },
    registration_no: { type: String },
    worker: { type: String },
    deletedBy: { type: String },
    updatedBy: { type: String, required: true },
    isDeleted: { type: Boolean, default: false },
}, { versionKey: false, strict: false, timestamps: true });

module.exports = mongoose.model('enquiry', schema);
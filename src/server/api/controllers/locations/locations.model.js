'use strict'

const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    id: { type: Number },
    address: { type: String },
    createdBy: { type: String, required: true, ref: 'users' },
    updatedBy: { type: String, required: true },
    deletedBy: { type: String },
    isDeleted: { type: Boolean, default: false },
}, {
    versionKey: false,
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('locations', schema);
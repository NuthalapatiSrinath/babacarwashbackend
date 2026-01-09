'use strict'

const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    id: { type: Number },
    updatedBy: { type: String, required: true },
    deletedBy: { type: String },
    isDeleted: { type: Boolean, default: false },
}, {
    versionKey: false,
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('vehicles', schema);
'use strict'

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    isRead: { type: Boolean, default: false },
    worker: { type: String },
    message: { type: String },
    createdBy: { type: String },
    updatedBy: { type: String },
}, {
    versionKey: false,
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('in-app-notifications', schema);
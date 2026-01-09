'use strict'

const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    isDeleted: { type: Boolean, default: false },
    type: { type: String, require: true },
    logs: {
        success: { type: Number },
        errors: { type: Array },
        duplicates: { type: Array }
    }
}, {
    versionKey: false,
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('import-logs', schema);
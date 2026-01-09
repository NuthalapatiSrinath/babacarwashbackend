'use strict'

const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    isDeleted: { type: Boolean, default: false },
    name: { type: String, require: true, trim: true }
}, {
    versionKey: false,
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('sites', schema);
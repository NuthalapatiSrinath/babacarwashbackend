'use strict'

const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    isDeleted: { type: Boolean, default: false },
    name: { type: String, require: true, trim: true },
    amount: { type: Number, default: 0 },
    building: { type: String, ref: 'buildings' },
    mall: { type: String, ref: 'malls' }
}, {
    versionKey: false,
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('pricing', schema);
'use strict'

const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    date: { type: Date },
    worker: { type: String, ref: 'workers' },
    staff: { type: String, ref: 'staff' },
    present: { type: Boolean, default: false },
    notes: { type: String },
    type: { type: String, default: 'AB' }
}, { versionKey: false, strict: false, timestamps: false });

module.exports = mongoose.model('attendance', schema);
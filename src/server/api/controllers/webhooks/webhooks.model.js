'use strict'

const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    type: { type: String },
    id: { type: String, unique: true }
}, {
    versionKey: false,
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('webhook-events', schema);
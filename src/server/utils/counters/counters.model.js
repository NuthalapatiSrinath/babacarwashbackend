'use strict'

const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    name: { type: String, required: true },
    count: { type: Number }
}, { versionKey: false, strict: false });

module.exports = mongoose.model('counters', schema);
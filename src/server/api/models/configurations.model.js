'use strict'

const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    contactNumber: { type: String }
}, {
    versionKey: false,
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('configurations', schema);
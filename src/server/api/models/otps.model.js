'use strict'

const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    otp: { type: Number, require: true }
}, {
    versionKey: false,
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('otps', schema);
'use strict'

const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    user: { type: String, ref: 'users' },
    token: { type: String },
    type: { type: String },
    consumed: { type: Boolean, default: false },
    expiresAt: { type: Date }
}, {
    versionKey: false,
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('auth-tokens', schema);
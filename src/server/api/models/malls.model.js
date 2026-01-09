'use strict'

const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    isDeleted: { type: Boolean, default: false },
    name: { type: String, require: true, trim: true },
    amount: { type: Number, default: 0 },
    card_charges: { type: Number, default: 0 }
}, {
    versionKey: false,
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('malls', schema);
'use strict'

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    id: { type: Number },
    status: { type: String, default: "pending" },
    createdBy: { type: String, required: true, ref: 'users' },
    amount: { type: Number },
    payment_date: { type: Date },
    updatedBy: { type: String, required: true },
    deletedBy: { type: String },
    isDeleted: { type: Boolean, default: false },
}, {
    versionKey: false,
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('transactions', schema);
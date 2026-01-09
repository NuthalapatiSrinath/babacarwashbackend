'use strict'

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    id: { type: Number },
    status: { type: String, default: "pending" },
    createdBy: { type: String, required: true, ref: 'users' },
    worker: { type: String, ref: 'worker' },
    amount_charged: { type: Number },
    amount_paid: { type: Number },
    settled: { type: String, default: "pending" },
    updatedBy: { type: String, required: true },
    deletedBy: { type: String },
    isDeleted: { type: Boolean, default: false },
}, {
    versionKey: false,
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('onewash-payments', schema);
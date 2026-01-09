'use strict'

const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    id: { type: Number },
    name: { type: String, trim: true },
    location_id: { type: String, ref: 'locations' },
    amount: { type: Number, default: 0 },
    card_charges: { type: Number, default: 0 },
    schedule_today: { type: Boolean, default: false },
    createdBy: { type: String, required: true, ref: 'users' },
    updatedBy: { type: String, required: true },
    deletedBy: { type: String },
    isDeleted: { type: Boolean, default: false },
}, {
    versionKey: false,
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('buildings', schema);
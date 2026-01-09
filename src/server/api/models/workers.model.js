'use strict'

const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    id: { type: Number },
    mobile: { type: String },
    name: { type: String },
    password: { type: String },
    hPassword: { type: String },
    buildings: { type: Array, ref: 'buildings' },
    malls: { type: Array, ref: 'malls' },
    status: { type: Number, default: 1 },
    supervisor: { type: String },
    createdBy: { type: String, required: true, ref: 'users' },
    updatedBy: { type: String, required: true },
    deletedBy: { type: String },
    isDeleted: { type: Boolean, default: false },
}, {
    versionKey: false,
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('workers', schema);
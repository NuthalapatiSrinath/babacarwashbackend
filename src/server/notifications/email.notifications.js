const EmailNotifications = module.exports
const nodemailer = require('nodemailer');
const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
const config = require('../utils/config');

const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: 587,
    tls: false,
    auth: {
        user: config.smtp.username,
        pass: config.smtp.password
    }
});

EmailNotifications.sendMail = async (payload) => {
    try {
        const mailOptions = {
            from: config.smtp.email,
            to: payload.email,
            subject: payload.subject,
            html: payload.body
        };
        return await transporter.sendMail(mailOptions)
    } catch (error) {
        console.log(error);
    }
}

const EmailNotifications = module.exports;
const nodemailer = require("nodemailer");
const ejs = require("ejs");
const fs = require("fs");
const path = require("path");
const config = require("../utils/config");

const hasSmtpConfig = () => {
  const host = (config?.smtp?.host || "").toString().trim();
  const username = (config?.smtp?.username || "").toString().trim();
  const password = (config?.smtp?.password || "").toString().trim();
  return Boolean(host && username && password);
};

const createTransporter = () => {
  if (!hasSmtpConfig()) return null;

  return nodemailer.createTransport({
    host: config.smtp.host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    tls: false,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
    auth: {
      user: config.smtp.username,
      pass: config.smtp.password,
    },
  });
};

const transporter = createTransporter();

EmailNotifications.sendMail = async (payload) => {
  try {
    if (!transporter) {
      console.log("[MAIL] SMTP not configured. Skipping email notification.");
      return { skipped: true, reason: "SMTP_NOT_CONFIGURED" };
    }

    const mailOptions = {
      from: config.smtp.email || config.smtp.username,
      to: payload.email,
      subject: payload.subject,
      html: payload.body,
    };
    return await transporter.sendMail(mailOptions);
  } catch (error) {
    console.log(`[MAIL] Email send failed: ${error?.message || error}`);
    return { success: false, error: error?.message || "MAIL_SEND_FAILED" };
  }
};

const moment = require("moment");
const uuidV4 = require("uuid/v4");
const config = require("../../../utils/config");
const UsersModel = require("../../models/users.model");
const OTPModel = require("../../models/otps.model");
const AuthTokensModel = require("../../models/auth-tokens.model");
const CommonHelper = require("../../../helpers/common.helper");
const AuthHelper = require("./auth.helper");
const EmailNotifications = require("../../../notifications/email.notifications");
const Events = require("../../../hooks/signup.event");
const service = module.exports;

service.signup = async (payload) => {
  const isExists = await UsersModel.countDocuments({ email: payload.email });

  if (isExists) {
    throw "ALREADY-REGISTERED";
  }

  // Generate the hash
  const passwordHash = AuthHelper.getPasswordHash(payload.password);

  const userData = {
    ...payload,
    password: passwordHash, // Save hash to pafssword (optional, good for consistency)
    hPassword: passwordHash, // ✅ CRITICAL FIX: Save hash to hPassword
    accountInfo: {
      accountId: uuidV4(),
      accountType: "root",
      accountCategory: "REGULAR",
    },
  };

  const data = await new UsersModel(userData).save();

  Events.signup(data);

  return data;
};

service.signin = async (payload) => {
  try {
    console.log("🔐 [ADMIN AUTH] Login attempt for number:", payload.number);

    const isExists = await UsersModel.countDocuments({
      number: payload.number,
      isDeleted: { $ne: true },
    });

    if (isExists == 0) {
      console.log("❌ [ADMIN AUTH] User not found for number:", payload.number);
      throw "UNAUTHORIZED";
    }

    const userData = await UsersModel.findOne({
      number: payload.number,
      isDeleted: { $ne: true },
    })
      .select("+hPassword +password")
      .populate("buildings mall")
      .lean();

    console.log(
      "👤 [ADMIN AUTH] User found:",
      userData.name,
      "| Role:",
      userData.role,
      "| Has hPassword:",
      !!userData.hPassword,
      "| Has password:",
      !!userData.password,
    );

    if (!userData.hPassword) {
      console.log(
        "❌ [ADMIN AUTH] No hPassword stored for:",
        userData.name,
        "- rehashing from plain password",
      );
      // If hPassword is missing but plain password exists, fix it
      if (userData.password) {
        const newHash = AuthHelper.getPasswordHash(userData.password);
        await UsersModel.updateOne(
          { _id: userData._id },
          { $set: { hPassword: newHash } },
        );
        userData.hPassword = newHash;
        console.log(
          "✅ [ADMIN AUTH] Regenerated hPassword for:",
          userData.name,
        );
      } else {
        console.log(
          "❌ [ADMIN AUTH] No password data at all for:",
          userData.name,
        );
        throw "UNAUTHORIZED";
      }
    }

    if (!AuthHelper.verifyPasswordHash(payload.password, userData.hPassword)) {
      console.log(
        "❌ [ADMIN AUTH] Password verification failed for:",
        userData.name,
      );
      throw "UNAUTHORIZED";
    }

    console.log(
      "✅ [ADMIN AUTH] Login successful for:",
      userData.name,
      "| Role:",
      userData.role,
    );

    // Block login for blocked users
    if (userData.isBlocked) {
      console.log("❌ [ADMIN AUTH] User is blocked:", userData.name);
      throw "BLOCKED";
    }

    const token = AuthHelper.createToken({ _id: userData._id });

    delete userData.hPassword;
    delete userData.password;

    return { token, ...userData };
  } catch (error) {
    console.error("❌ [ADMIN AUTH] Login error:", error);
    throw error;
  }
};

service.verification = async (payload) => {
  const isExists = await UsersModel.countDocuments({ email: payload.email });

  if (isExists) {
    throw "ALREADY-REGISTERED";
  }

  const lastOTP = await OTPModel.findOne({ email: payload.email })
    .sort({ _id: -1 })
    .lean();

  if (
    lastOTP &&
    moment().isBefore(moment(lastOTP.createdAt).add(60, "seconds"))
  ) {
    throw "FREQUENT";
  }

  const otp = CommonHelper.RandomNumber(4);

  await EmailNotifications.send({ email: payload.email, otp });
  return await new OTPModel({ email: payload.email, otp }).save();
};

service.verificationValidation = async (payload) => {
  const lastOTP = await OTPModel.findOne({ email: payload.email })
    .sort({ _id: -1 })
    .lean();

  if (lastOTP && lastOTP.otp == payload.otp) {
    return true;
  }

  throw "INVALID";
};

service.forgotPassword = async (payload) => {
  try {
    const userData = await UsersModel.findOne({ email: payload.email }).lean();

    if (!userData) {
      throw "INVALID";
    }

    const token = uuidV4();
    await new AuthTokensModel({
      user: userData._id,
      type: "password-reset",
      token,
      expiresAt: moment().subtract("day", 1),
    }).save();
    EmailNotifications.forgotPasswordLink({
      ...userData,
      resetLink: `${config.redirectUrls.resetPassword}?token=${token}`,
    });
  } catch (error) {
    throw error;
  }
};

service.resetPassword = async (payload) => {
  try {
    const tokenData = await AuthTokensModel.findOne({
      token: payload.token,
      consumed: false,
    })
      .populate("user")
      .lean();

    if (!tokenData) {
      throw "INVALID";
    }

    const password = AuthHelper.getPasswordHash(payload.password);

    await UsersModel.updateOne(
      { _id: tokenData.user._id },
      { $set: { password } },
    );
    await AuthTokensModel.updateOne(
      { _id: tokenData._id },
      { $set: { consumed: true } },
    );

    EmailNotifications.resetPasswordConfirmation(tokenData.user);
  } catch (error) {
    throw error;
  }
};

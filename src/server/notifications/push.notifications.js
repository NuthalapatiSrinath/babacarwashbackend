const admin = require("firebase-admin");

let isInitialized = false;

const getFirebaseApp = () => {
  if (isInitialized) {
    return admin.app();
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (serviceAccountJson) {
    const parsed = JSON.parse(serviceAccountJson);
    admin.initializeApp({ credential: admin.credential.cert(parsed) });
    isInitialized = true;
    return admin.app();
  }

  if (serviceAccountBase64) {
    const decoded = Buffer.from(serviceAccountBase64, "base64").toString(
      "utf8",
    );
    const parsed = JSON.parse(decoded);
    admin.initializeApp({ credential: admin.credential.cert(parsed) });
    isInitialized = true;
    return admin.app();
  }

  throw new Error(
    "Firebase is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_BASE64 in backend environment.",
  );
};

const normalizeDataPayload = (data = {}) => {
  const normalized = {};
  Object.entries(data || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    normalized[String(key)] =
      typeof value === "string" ? value : JSON.stringify(value);
  });
  return normalized;
};

const pushNotifications = module.exports;

pushNotifications.isConfigured = () => {
  return !!(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
  );
};

pushNotifications.getHealthStatus = () => {
  try {
    const configured = pushNotifications.isConfigured();
    if (!configured) {
      return {
        configured: false,
        initialized: false,
        message:
          "Firebase env not found. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_BASE64.",
      };
    }

    getFirebaseApp();
    return {
      configured: true,
      initialized: true,
      message: "Firebase push is configured and initialized.",
    };
  } catch (error) {
    return {
      configured: true,
      initialized: false,
      message: error.message || "Firebase initialization failed",
    };
  }
};

pushNotifications.sendToTokens = async ({
  tokens = [],
  title,
  body,
  imageUrl,
  data = {},
}) => {
  const uniqueTokens = Array.from(new Set(tokens.filter(Boolean)));
  if (uniqueTokens.length === 0) {
    return { successCount: 0, failureCount: 0, invalidTokens: [] };
  }

  getFirebaseApp();

  const normalizedImageUrl = String(imageUrl || "").trim();
  const response = await admin.messaging().sendEachForMulticast({
    tokens: uniqueTokens,
    notification: {
      title: String(title || "BCW Notification"),
      body: String(body || ""),
      ...(normalizedImageUrl ? { imageUrl: normalizedImageUrl } : null),
    },
    data: normalizeDataPayload({
      ...data,
      ...(normalizedImageUrl ? { imageUrl: normalizedImageUrl } : null),
    }),
    android: {
      priority: "high",
      notification: {
        channelId: "bcw_customer_high_importance",
        ...(normalizedImageUrl ? { imageUrl: normalizedImageUrl } : null),
      },
    },
    webpush: {
      notification: {
        ...(normalizedImageUrl ? { image: normalizedImageUrl } : null),
      },
    },
    apns: {
      headers: {
        "apns-priority": "10",
      },
      payload: {
        aps: {
          sound: "default",
        },
      },
    },
  });

  const invalidTokens = [];

  response.responses.forEach((result, index) => {
    if (result.success) return;
    const code = result.error?.code || "";
    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token"
    ) {
      invalidTokens.push(uniqueTokens[index]);
    }
  });

  return {
    successCount: response.successCount,
    failureCount: response.failureCount,
    invalidTokens,
  };
};

const BookingsModel = require("../../models/bookings.model");
const mongoose = require("mongoose");

const clientsByCustomer = new Map();
let watcher = null;
let watcherBootstrapped = false;
let watcherUnavailable = false;
const ENABLE_CHANGE_STREAMS = process.env.SSE_USE_CHANGE_STREAMS === "true";
const POLL_INTERVAL_MS = Number(process.env.SSE_POLL_INTERVAL_MS || 3000);
const pollStateByCustomer = new Map();
let pollTimer = null;

const isReplicaSetRequiredError = (error) => {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("only supported on replica sets") ||
    message.includes("$changestream") ||
    (message.includes("change stream") && message.includes("replica set"))
  );
};

const safeWrite = (res, chunk) => {
  try {
    res.write(chunk);
    return true;
  } catch (_) {
    return false;
  }
};

const sendEvent = (res, event, payload) => {
  const body = JSON.stringify(payload || {});
  return safeWrite(res, `event: ${event}\ndata: ${body}\n\n`);
};

const getCustomerIdFromChange = (change) => {
  if (change?.fullDocument?.customer) {
    return String(change.fullDocument.customer);
  }

  const updatedFields = change?.updateDescription?.updatedFields || {};
  if (updatedFields.customer) {
    return String(updatedFields.customer);
  }

  return null;
};

const sendToCustomer = (customerId, payload) => {
  const id = String(customerId || "");
  if (!id) return;

  const clients = clientsByCustomer.get(id);
  if (!clients || clients.size === 0) return;

  for (const client of [...clients]) {
    const ok = sendEvent(client.res, "booking-change", payload);
    if (!ok) {
      try {
        client.cleanup();
      } catch (_) {}
    }
  }
};

const buildCustomerCandidates = (customerId) => {
  const textId = String(customerId || "");
  const candidates = [textId];

  if (mongoose.Types.ObjectId.isValid(textId)) {
    candidates.push(new mongoose.Types.ObjectId(textId));
  }

  return candidates;
};

const fetchLatestBookingVersion = async (customerId) => {
  const latest = await BookingsModel.findOne({
    isDeleted: false,
    customer: { $in: buildCustomerCandidates(customerId) },
  })
    .sort({ updatedAt: -1, _id: -1 })
    .select("_id updatedAt createdAt")
    .lean();

  if (!latest) return null;

  const ts = new Date(latest.updatedAt || latest.createdAt || 0).getTime();
  if (!Number.isFinite(ts) || ts <= 0) return null;

  return { id: latest._id, ts };
};

const runPollCycle = async () => {
  const customerIds = [...clientsByCustomer.keys()];
  if (!customerIds.length) return;

  for (const customerId of customerIds) {
    try {
      const latest = await fetchLatestBookingVersion(customerId);
      if (!latest) continue;

      const state = pollStateByCustomer.get(customerId) || { lastSeen: 0 };
      if (latest.ts > state.lastSeen) {
        pollStateByCustomer.set(customerId, { lastSeen: latest.ts });
        sendToCustomer(customerId, {
          operation: "sync",
          bookingId: String(latest.id || ""),
          customer: String(customerId),
          source: "poller",
        });
      }
    } catch (_) {}
  }
};

const ensurePoller = () => {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    runPollCycle();
  }, POLL_INTERVAL_MS);
};

const teardownPollerIfIdle = () => {
  if (clientsByCustomer.size > 0) return;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

const broadcastToAll = (payload) => {
  for (const customerId of clientsByCustomer.keys()) {
    sendToCustomer(customerId, payload);
  }
};

const bootstrapWatcher = () => {
  if (!ENABLE_CHANGE_STREAMS) {
    watcherUnavailable = true;
    ensurePoller();
    return;
  }

  if (watcherBootstrapped || watcherUnavailable) return;
  watcherBootstrapped = true;

  try {
    watcher = BookingsModel.watch([], {
      fullDocument: "updateLookup",
      fullDocumentBeforeChange: "whenAvailable",
    });

    watcher.on("change", (change) => {
      const operation = change?.operationType || "unknown";
      const customerId =
        getCustomerIdFromChange(change) ||
        String(change?.fullDocumentBeforeChange?.customer || "");

      const payload = {
        operation,
        bookingId: String(change?.documentKey?._id || ""),
        customer: customerId,
      };

      if (customerId) {
        sendToCustomer(customerId, payload);
      } else {
        // For deletes where customer lookup is unavailable, refresh all active sessions.
        broadcastToAll(payload);
      }
    });

    watcher.on("error", (error) => {
      if (isReplicaSetRequiredError(error)) {
        watcherUnavailable = true;
        try {
          watcher?.close?.();
        } catch (_) {}
        watcher = null;
        watcherBootstrapped = false;
        ensurePoller();
        return;
      }

      console.error("[SSE] Bookings watcher error:", error?.message || error);
      watcherBootstrapped = false;
      watcher = null;

      setTimeout(() => {
        bootstrapWatcher();
      }, 3000);
    });
  } catch (error) {
    if (isReplicaSetRequiredError(error)) {
      watcherUnavailable = true;
      watcherBootstrapped = false;
      watcher = null;
      ensurePoller();
      return;
    }

    console.error(
      "[SSE] Failed to start bookings watcher:",
      error?.message || error,
    );
    watcherBootstrapped = false;
    watcher = null;
  }
};

module.exports.subscribe = (req, res) => {
  const customerId = String(req?.user?._id || "");
  if (!customerId) {
    return res.status(401).json({ statusCode: 401, message: "UNAUTHORIZED" });
  }

  bootstrapWatcher();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const clients = clientsByCustomer.get(customerId) || new Set();
  if (!pollStateByCustomer.has(customerId)) {
    pollStateByCustomer.set(customerId, { lastSeen: 0 });
  }
  ensurePoller();

  const keepAlive = setInterval(() => {
    safeWrite(res, ": keep-alive\n\n");
  }, 25000);

  const cleanup = () => {
    clearInterval(keepAlive);

    const activeClients = clientsByCustomer.get(customerId);
    if (!activeClients) return;

    for (const client of [...activeClients]) {
      if (client.res === res) {
        activeClients.delete(client);
      }
    }

    if (activeClients.size === 0) {
      clientsByCustomer.delete(customerId);
      pollStateByCustomer.delete(customerId);
      teardownPollerIfIdle();
    }
  };

  const clientEntry = { res, cleanup };
  clients.add(clientEntry);
  clientsByCustomer.set(customerId, clients);

  sendEvent(res, "connected", { customer: customerId });

  req.on("close", cleanup);
};

const service = require("./configurations.service");
const {
  onConfigurationUpdated,
} = require("../../../events/configurations.events");
const controller = (module.exports = {});

controller.fetch = async (req, res) => {
  try {
    const data = await service.fetch();
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error("Customer configurations fetch error:", error);
    return res
      .status(500)
      .json({ message: "Internal server errorjkhjjkjkjkjkkhkhkh", error });
  }
};

controller.stream = async (req, res) => {
  let unsubscribe = null;
  let heartbeat = null;

  const cleanup = () => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    const sendEvent = (eventName, payload) => {
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${JSON.stringify(payload || {})}\n\n`);
    };

    const snapshot = await service.fetch();
    sendEvent("configurations.snapshot", snapshot);

    unsubscribe = onConfigurationUpdated((payload) => {
      sendEvent("configurations.updated", payload);
    });

    heartbeat = setInterval(() => {
      res.write(": keep-alive\n\n");
    }, 25000);

    req.on("close", () => {
      cleanup();
      res.end();
    });
  } catch (error) {
    cleanup();
    console.error("Customer configurations stream error:", error);
    if (!res.headersSent) {
      return res.status(500).json({ message: "Internal server error", error });
    }
    res.end();
  }
};

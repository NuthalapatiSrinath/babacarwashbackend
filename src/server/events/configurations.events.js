const EventEmitter = require("events");

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const CONFIGURATIONS_UPDATED_EVENT = "configurations.updated";

const emitConfigurationUpdated = (payload = {}) => {
  emitter.emit(CONFIGURATIONS_UPDATED_EVENT, payload);
};

const onConfigurationUpdated = (listener) => {
  emitter.on(CONFIGURATIONS_UPDATED_EVENT, listener);
  return () => emitter.off(CONFIGURATIONS_UPDATED_EVENT, listener);
};

module.exports = {
  CONFIGURATIONS_UPDATED_EVENT,
  emitConfigurationUpdated,
  onConfigurationUpdated,
};

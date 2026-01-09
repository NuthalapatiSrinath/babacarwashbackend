const SignupEvents = require('./signup.event')
const { EventEmitter } = require('events')
const EventsHandler = new EventEmitter()

EventsHandler.on('signup', SignupEvents.signup)

module.exports = EventsHandler
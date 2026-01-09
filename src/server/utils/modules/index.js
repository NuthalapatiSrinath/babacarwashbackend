const express = require('express')
const mongoose = require('mongoose')
const joi = require('@hapi/joi')
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

module.exports = {
    express,
    mongoose,
    joi,
    cors,
    bodyParser,
    path
}
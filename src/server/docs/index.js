const swaggerJSDoc = require('swagger-jsdoc');

const auth = require('./controllers/auth.json');
const users = require('./controllers/users.json');

const routePaths = {
    ...auth.paths,
    ...users.paths,
};

const options = {
    swaggerDefinition: {
        openapi: '3.0.0',
        info: {
            title: 'BCW',
            description: 'API documentation for bcw',
            version: '1.0.0',
        },
    },
    apis: [],
};

const mainSwaggerSpec = swaggerJSDoc(options);
mainSwaggerSpec.paths = routePaths;

module.exports = mainSwaggerSpec;
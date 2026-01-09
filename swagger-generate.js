const swaggerAutogen = require('swagger-autogen')();

const outputFile = './src/server/docs/controllers/notifications.json';
const endpointsFiles = ['./src/server/api/controllers/notifications/index.js'];

const doc = {
    info: {
        title: 'Your API Documentation',
        description: 'API documentation for your Node.js application',
        version: '1.0.0',
    },
    host: 'localhost:3000',
    basePath: '/api',
};

swaggerAutogen(outputFile, endpointsFiles, doc).then(() => {
    console.log('Swagger documentation has been generated.');
});

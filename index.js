"use strict";

const utils = require("./src/server/utils");
const database = require("./src/server/database");
const createServer = require("./src/server");

const initialize = async () => {
  try {
    const utilsData = utils.initialize();

    await database.initialize(utilsData);

    const app = createServer(utilsData);

    app.listen(utilsData.config.port, () => {
      console.log(
        `BCW Backend | server is up and running in ${utilsData.config.env.toUpperCase()} environment on port ${
          utilsData.config.port
        }`
      );
    });
  } catch (error) {
    console.error("ALERT!", error);
  }
};

initialize();

const swaggerUi = require("swagger-ui-express");
const swaggerDocs = require("../server/docs");

module.exports = function createServer(input = {}) {
  const { modules, config } = input;
  const { express, bodyParser, cors, path } = modules;

  const app = express();

  app.use(cors());
  app.use(bodyParser.json({ limit: "50mb" }));
  app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

  // Serve uploaded files
  app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

  require("./api/routes.main")(app);

  return app;
};

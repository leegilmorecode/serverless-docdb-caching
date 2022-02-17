export const config = {
  mongoServer: process.env.MONGO_SERVER,
  mongoPort: process.env.MONGO_PORT,
  mongoDatabase: process.env.MONGO_DB || "test",
  serviceName: process.env.SERVICE_NAME,
  mongoMasterUser: process.env.MONGO_USERNAME,
  mongoMasterPassword: process.env.MONGO_PASSWORD,
  mongoCollection: process.env.MONGO_COLLECTION || "test",
  serviceLayerUrl: process.env.SERVICE_LAYER || "",
};

import { MongoClient, MongoClientOptions } from "mongodb";

import { config } from "../config";

export function buildMongoClient(
  minPoolSize = 1,
  maxPoolSize = 1
): MongoClient {
  const url = process.env.DEV
    ? "mongodb://localhost:27017"
    : `mongodb://${config.mongoMasterUser}:${config.mongoMasterPassword}@${config.mongoServer}:${config.mongoPort}/${config.mongoDatabase}?replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false`;

  const options: MongoClientOptions = process.env.DEV
    ? {}
    : {
        ssl: true,
        sslCA: "/opt/rds-combined-ca-bundle.pem",
        minPoolSize,
        maxPoolSize, // this is important as the default size is 5 in a conn pool and not great for Lambda
      };

  return new MongoClient(url, options);
}

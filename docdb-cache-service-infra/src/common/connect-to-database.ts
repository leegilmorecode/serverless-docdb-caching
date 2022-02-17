import { Db, MongoClient } from "mongodb";

import { config } from "../config";

export const connectToDatabase = async (client: MongoClient): Promise<Db> => {
  await client.connect();
  console.log(`connected successfully to server ${config.serviceName}`);

  const db = client.db(config.mongoDatabase);
  console.log(`connected successfully to database ${config.mongoDatabase}`);

  return db;
};

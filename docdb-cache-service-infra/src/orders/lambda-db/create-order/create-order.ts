import {
  APIGatewayEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from "aws-lambda";
import { Collection, Db, InsertOneResult, MongoClient } from "mongodb";
import { buildMongoClient, connectToDatabase } from "../../../common";

import { config } from "../../../config";

const client: MongoClient = buildMongoClient();
let cachedDb: Db;

// connects to the documentdb database
async function databaseConnect(): Promise<Db> {
  try {
    if (cachedDb) {
      console.log("database connection already established");
      return Promise.resolve(cachedDb);
    }

    console.log("No database connection available");
    const db = await connectToDatabase(client);

    return db;
  } catch (error) {
    console.log(`Error worth logging: ${error}`);
    throw new Error("unable to connect");
  }
}

export const handler: APIGatewayProxyHandler = async ({
  body,
}: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  try {
    console.log("create-order.handler - started");

    if (!body) throw new Error("no order supplied");

    const order: Order = JSON.parse(body);

    console.log(`create-order.handler - order: ${JSON.stringify(order)}`);

    const db: Db = await databaseConnect();

    const collection: Collection<any> = db.collection(config.mongoCollection);

    const insertResult: InsertOneResult = await collection.insertOne(order);

    // lets make it obvious in logs how the connections are doing
    const { connections } = await db.admin().serverStatus();
    console.log(
      `create-order.handler - current connections: ${connections.current}, available: ${connections.available}`
    );

    console.log(
      `create-order.handler - successful: ${JSON.stringify(insertResult)}`
    );

    return {
      body: JSON.stringify(insertResult),
      statusCode: 201,
    };
  } catch (error) {
    console.error(error);
    return {
      body: JSON.stringify(error),
      statusCode: 500,
    };
  }
};

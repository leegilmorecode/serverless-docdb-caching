import {
  APIGatewayEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from "aws-lambda";
import { Collection, Db, Document, MongoClient } from "mongodb";
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
    const db: Db = await connectToDatabase(client);

    cachedDb = db;
    return db;
  } catch (error) {
    console.log(`Error worth logging: ${error}`);
    throw new Error("unable to connect");
  }
}

export const handler: APIGatewayProxyHandler = async ({
  pathParameters,
}: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  try {
    console.log("get-order.handler - started");

    if (!pathParameters) throw new Error("Order Id not defined");

    const orderId = pathParameters["id"];

    console.log(`get order ${orderId}`);

    const db: Db = await databaseConnect();

    const collection: Collection<any> = db.collection(config.mongoCollection);

    const document: Document = await collection.findOne(
      { orderId: orderId },
      {}
    );

    // lets make it obvious in logs how the connections are doing
    const { connections } = await db.admin().serverStatus();
    console.log(
      `get-order.handler - current connections: ${connections.current}, available: ${connections.available}`
    );

    console.log(`get-order.handler - successful: ${JSON.stringify(document)}`);

    return {
      body: JSON.stringify(document),
      statusCode: 200,
    };
  } catch (error) {
    console.error(error);
    return {
      body: JSON.stringify(error),
      statusCode: 500,
    };
  }
};

import {
  Collection,
  Db,
  Document,
  FindOptions,
  InsertOneOptions,
  InsertOneResult,
  MongoClient,
  MongoClientOptions,
  WithId,
} from "mongodb";
import express, { Request, Response } from "express";

import bodyParser from "body-parser";
import logger from "morgan";
import path from "path";

const app = express();

const serverPort = process.env.SERVER_PORT || 80;
const mongoServer = process.env.MONGO_SERVER;
const mongoPort = process.env.MONGO_PORT;
const mongoDatabase = process.env.MONGO_DB || "test";
const serviceName = process.env.SERVICE_NAME;
const mongoMasterUser = process.env.MONGO_USERNAME;
const mongoMasterPassword = process.env.MONGO_PASSWORD;

const client: MongoClient = buildMongoClient();

function buildMongoClient(): MongoClient {
  const url = process.env.DEV
    ? "mongodb://localhost:27017"
    : `mongodb://${mongoMasterUser}:${mongoMasterPassword}@${mongoServer}:${mongoPort}/${mongoDatabase}?replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false`;

  const options: MongoClientOptions = process.env.DEV
    ? {}
    : {
        ssl: true,
        sslCA: `${path.resolve()}/rds-combined-ca-bundle.pem`,
        minPoolSize: 5,
        maxPoolSize: 100,
      };

  return new MongoClient(url, options);
}

/* 
   example of how a caching layer could work for documentdb for connection management with serverless
   (kept in one file for ease of viewing in blog post and as this is simply a poc) 
*/
async function main(): Promise<void> {
  await databaseConnect();
  startServer();
}

// connects to the documentdb database
async function databaseConnect(): Promise<void> {
  try {
    await client.connect();
    console.log("connected successfully to server");

    const db: Db = client.db(mongoDatabase);
    console.log(`connected successfully to database ${mongoDatabase}`);

    app.locals.db = db;
  } catch (error) {
    console.log(`Error worth logging: ${error}`);
    throw new Error("unable to connect");
  }
}

// starts the server passing in the db context which is connected
function startServer(): void {
  try {
    app.use(logger("tiny"));
    app.use(bodyParser.json());

    // used for the alb healthcheck
    app.get("/", async (req: Request, res: Response) => {
      // lets make it obvious in the healthcheck logs how the connections are doing in realtime
      const { connections } = await app.locals.db.admin().serverStatus();

      console.log(
        `healthcheck - current connections: ${connections.current}, available: ${connections.available}`
      );
      res.send(`${serviceName} healthy`);
    });

    app.listen(serverPort, (): void =>
      console.log(`${serviceName} listening on port ${serverPort}`)
    );

    // insertOne - https://docs.mongodb.com/manual/reference/method/db.collection.insertOne/
    app.post(
      "/insertOne",
      async (
        req: Request,
        res: Response
      ): Promise<express.Response<any, Record<string, any>>> => {
        try {
          const { collectionName, body, writeConcern, forceServerObjectId } =
            req.body;

          const collection: Collection<any> =
            app.locals.db.collection(collectionName);

          const options: InsertOneOptions = {
            writeConcern,
            forceServerObjectId,
            // and the other options besides
          };

          const insertResult: InsertOneResult = await collection.insertOne(
            body,
            options
          );

          console.log(`insertOne - body: ${JSON.stringify(body)}`);

          // log the current amount of connections
          const { connections } = await app.locals.db.admin().serverStatus();
          console.log(
            `insertOne - current connections: ${connections.current}, available: ${connections.available}`
          );

          return res.send(insertResult);
        } catch (error) {
          console.log(error);
          return res.sendStatus(500);
        }
      }
    );

    // find based on query filter - https://docs.mongodb.com/manual/reference/method/db.collection.find/
    app.post(
      "/find",
      async (
        req: Request,
        res: Response
      ): Promise<express.Response<any, Record<string, any>>> => {
        try {
          const {
            collectionName,
            queryFilter,
            projection,
            limit,
            sort,
            skip,
            hint,
            min,
            max,
            // and the other options besides
          } = req.body;

          const options: FindOptions<Document> = {
            projection,
            limit,
            sort,
            skip,
            hint,
            min,
            max,
          };

          const collection: Collection<any> =
            app.locals.db.collection(collectionName);

          const filteredDocs: WithId<any>[] = await collection
            .find(queryFilter, options)
            .toArray();

          console.log(`find - body: ${JSON.stringify(queryFilter)}`);

          // log the current amount of connections
          const { connections } = await app.locals.db.admin().serverStatus();
          console.log(
            `find - current connections: ${connections.current}, available: ${connections.available}`
          );

          return res.send(filteredDocs);
        } catch (error) {
          return res.sendStatus(500);
        }
      }
    );

    // findOne based on query - https://docs.mongodb.com/manual/reference/method/db.collection.findOne/
    app.post("/findOne", async (req: Request, res: Response) => {
      try {
        const { collectionName, queryFilter, projection } = req.body;

        const options: FindOptions<Document> = {
          projection,
        };

        const collection: Collection<any> =
          app.locals.db.collection(collectionName);

        const document: Document = await collection.findOne(
          { ...queryFilter },
          options
        );

        console.log(`findOne - body: ${JSON.stringify(queryFilter)}`);

        // log the current amount of connections
        const { connections } = await app.locals.db.admin().serverStatus();
        console.log(
          `findOne - current connections: ${connections.current}, available: ${connections.available}`
        );

        return res.send(document);
      } catch (error) {
        return res.sendStatus(500);
      }
    });
  } catch (error) {
    console.log(error);
    // close the client database connection on error
    client.close();
  }
}

main().catch((error) => console.error(error));

import {
  APIGatewayEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from "aws-lambda";

import { config } from "../../../config";
import { findOne } from "../../../service-layer";

export const handler: APIGatewayProxyHandler = async ({
  pathParameters,
}: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  try {
    console.log("get-order.handler - started");

    if (!pathParameters || !pathParameters.id)
      throw new Error("Order Id not defined");

    const orderId = pathParameters["id"];

    console.log(`get order ${orderId}`);
    console.log(
      `get-order.handler - service layer: ${config.serviceLayerUrl}, collection ${config.mongoCollection}`
    );

    // get the item using our service layer i.e. http
    const order: Order = await findOne(
      config.serviceLayerUrl,
      config.mongoCollection,
      orderId
    );

    console.log(`get-order.handler - successful: ${JSON.stringify(order)}`);

    return {
      body: JSON.stringify(order),
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

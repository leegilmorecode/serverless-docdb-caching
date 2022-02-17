import {
  APIGatewayEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from "aws-lambda";

import { config } from "../../../config";
import { create } from "../../../service-layer";

export const handler: APIGatewayProxyHandler = async ({
  body,
}: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  try {
    console.log("create-order.handler - started");

    if (!body) throw new Error("no order supplied");

    const order: Order = JSON.parse(body);

    console.log(`create-order.handler - order: ${JSON.stringify(order)}`);

    console.log(
      `create-order.handler - service layer: ${config.serviceLayerUrl}, collection ${config.mongoCollection}`
    );

    // create the item using our service layer i.e. http
    const createdOrder: Order = await create(
      config.serviceLayerUrl,
      config.mongoCollection,
      order
    );

    console.log(
      `create-order.handler: order ${JSON.stringify(
        order
      )} - successful: ${createdOrder}`
    );

    console.log(`create-order.handler - successful`);

    return {
      body: JSON.stringify(createdOrder),
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

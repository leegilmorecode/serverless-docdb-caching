import axios, { AxiosResponse } from "axios";

export const findOne = async (
  serviceLayerUrl: string,
  collectionName: string,
  id: string | number
) => {
  const { data }: { data: Order } = await axios.post(
    `http://${serviceLayerUrl}/findOne`,
    {
      collectionName,
      queryFilter: {
        orderId: id,
      },
    }
  );

  return data;
};

export const create = async (
  serviceLayerUrl: string,
  collectionName: string,
  order: Order
) => {
  const { data }: AxiosResponse<any, any> = await axios.post(
    `http://${serviceLayerUrl}/insertOne`,
    {
      collectionName,
      body: order,
    }
  );

  return {
    id: data.insertedId,
    ...order,
  };
};

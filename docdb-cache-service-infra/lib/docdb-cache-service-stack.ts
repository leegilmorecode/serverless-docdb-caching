import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as docdb from "aws-cdk-lib/aws-docdb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as nodeLambda from "aws-cdk-lib/aws-lambda-nodejs";

import { RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";

import { Construct } from "constructs";
import path from "path";

export class DocdbCacheServiceStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // create the vpc for the demo
    const vpc: ec2.Vpc = new ec2.Vpc(this, "DocdbCachingServiceVpc", {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "private-subnet",
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        },
        {
          cidrMask: 24,
          name: "public-subnet",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    // create the documentdb cluster
    const docDbCluster: docdb.DatabaseCluster = new docdb.DatabaseCluster(
      this,
      "DocdbCluster",
      {
        masterUser: {
          username: "adminuser",
          secretName: "/docdb-caching-service/docdb/masterpassword",
          excludeCharacters: "'\"@/:`$<>#|%{}[]!?^\\.~*()",
        },
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T3,
          ec2.InstanceSize.MEDIUM
        ),
        dbClusterName: "docdb-cluster",
        deletionProtection: false,
        removalPolicy: RemovalPolicy.DESTROY,
        storageEncrypted: true,
        engineVersion: "4.0.0",
        instances: 3,
        cloudWatchLogsRetention: logs.RetentionDays.ONE_DAY,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        },
        vpc,
      }
    );

    // create the fargate cluster
    const cluster: ecs.Cluster = new ecs.Cluster(
      this,
      "DocdbCachingServiceCluster",
      {
        vpc: vpc,
        clusterName: "docdb-caching-service-cluster",
        containerInsights: true,
      }
    );

    // get the generated secrets to pass to the fargate container tasks for ease of demo
    // (should use secrets manager in code but this is for the demo only)
    const username = docDbCluster.secret
      ?.secretValueFromJson("username")
      .toString() as string;

    const password = docDbCluster.secret
      ?.secretValueFromJson("password")
      .toString() as string;

    // create the environment variables for both ecs tasks and lambdas
    const environment = {
      SERVICE_NAME: "docdb-caching-service",
      SERVER_PORT: "80",
      MONGO_DB: "test",
      MONGO_SERVER: docDbCluster.clusterEndpoint.hostname,
      MONGO_PORT: docDbCluster.clusterEndpoint.portAsString(),
      MONGO_USERNAME: username,
      MONGO_PASSWORD: password,
    };

    // create the fargate service with relevant environment variables
    const loadBalancedFargateService =
      new ecs_patterns.ApplicationLoadBalancedFargateService(
        this,
        "DocdbCachingService",
        {
          cluster: cluster,
          serviceName: "docdb-caching-service",
          cpu: 256,
          desiredCount: 3,
          maxHealthyPercent: 100,
          minHealthyPercent: 0,
          circuitBreaker: { rollback: false },
          assignPublicIp: true,
          loadBalancerName: "docdb-caching-internal-alb",
          taskImageOptions: {
            image: ecs.ContainerImage.fromAsset("../docdb-cache-service/"),
            enableLogging: true,
            logDriver: new ecs.AwsLogDriver({
              streamPrefix: "docdb-caching-service",
            }),
            containerName: "docdb-caching-service",
            family: "docdb-caching-service",
            environment,
          },
          memoryLimitMiB: 512,
          publicLoadBalancer: false,
        }
      );

    const scalableTarget =
      loadBalancedFargateService.service.autoScaleTaskCount({
        minCapacity: 1,
        maxCapacity: 10,
      });

    scalableTarget.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 50,
    });

    scalableTarget.scaleOnMemoryUtilization("MemoryScaling", {
      targetUtilizationPercent: 50,
    });

    // create a lambda layer containing the pem file for lambdas to connect to docdb
    const docdbPemFileLayer: lambda.LayerVersion = new lambda.LayerVersion(
      this,
      "doc-db-pem-file-layer",
      {
        compatibleRuntimes: [lambda.Runtime.NODEJS_14_X],
        code: lambda.Code.fromAsset("src/layer/rds-combined-ca-bundle.pem.zip"),
        description: "documentdb pem file layer",
        removalPolicy: RemovalPolicy.DESTROY,
      }
    );

    // create the 'create-order' lambda - going directly to database so we can load test connections
    const createOrderHandler: nodeLambda.NodejsFunction =
      new nodeLambda.NodejsFunction(this, "create-order-db", {
        functionName: "create-order-db",
        runtime: lambda.Runtime.NODEJS_14_X,
        layers: [docdbPemFileLayer],
        entry: path.join(
          __dirname,
          "/../src/orders/lambda-db/create-order/create-order.ts"
        ),
        memorySize: 1024,
        handler: "handler",
        vpc: vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        },
        bundling: {
          minify: true,
          externalModules: ["aws-sdk"],
        },
        environment: {
          ...environment,
          MONGO_COLLECTION: "orders",
        },
      });

    // create the 'get-order' lambda - going directly to database so we can load test connections
    const getOrderHandler: nodeLambda.NodejsFunction =
      new nodeLambda.NodejsFunction(this, "get-order-db", {
        functionName: "get-order-db",
        runtime: lambda.Runtime.NODEJS_14_X,
        layers: [docdbPemFileLayer],
        entry: path.join(
          __dirname,
          "/../src/orders/lambda-db/get-order/get-order.ts"
        ),
        memorySize: 1024,
        handler: "handler",
        vpc: vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        },
        bundling: {
          minify: true,
          externalModules: ["aws-sdk"],
        },
        environment: {
          ...environment,
          MONGO_COLLECTION: "orders",
        },
      });

    // create the 'create-order' lambda - going through service layer using http
    const createOrderServiceHandler: nodeLambda.NodejsFunction =
      new nodeLambda.NodejsFunction(this, "create-order-service", {
        functionName: "create-order-service",
        runtime: lambda.Runtime.NODEJS_14_X,
        entry: path.join(
          __dirname,
          "/../src/orders/lambda-service-layer/create-order/create-order.ts"
        ),
        memorySize: 1024,
        handler: "handler",
        vpc: vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        },
        bundling: {
          minify: true,
          externalModules: ["aws-sdk"],
        },
        environment: {
          SERVICE_LAYER:
            loadBalancedFargateService.loadBalancer.loadBalancerDnsName,
          MONGO_COLLECTION: "orders",
        },
      });

    // create the 'get-order' lambda - going through the service layer using http
    const getOrderServiceHandler: nodeLambda.NodejsFunction =
      new nodeLambda.NodejsFunction(this, "get-order-service", {
        functionName: "get-order-service",
        runtime: lambda.Runtime.NODEJS_14_X,
        entry: path.join(
          __dirname,
          "/../src/orders/lambda-service-layer/get-order/get-order.ts"
        ),
        memorySize: 1024,
        handler: "handler",
        vpc: vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        },
        bundling: {
          minify: true,
          externalModules: ["aws-sdk"],
        },
        environment: {
          SERVICE_LAYER:
            loadBalancedFargateService.loadBalancer.loadBalancerDnsName,
          MONGO_COLLECTION: "orders",
        },
      });

    // allow inbound connections from ecs service to the database cluster
    docDbCluster.connections.allowFrom(
      loadBalancedFargateService.service,
      ec2.Port.tcp(27017),
      "allow inbound from ecs only"
    );

    // allow inbound connections from lambda to the database cluster
    docDbCluster.connections.allowFrom(
      createOrderHandler,
      ec2.Port.tcp(27017),
      "allow inbound from lambda only"
    );

    docDbCluster.connections.allowFrom(
      getOrderHandler,
      ec2.Port.tcp(27017),
      "allow inbound from lambda only"
    );

    // create the rest API for accessing our orders db lambdas (connecting to the database directly)
    const ordersDbApi: apigw.RestApi = new apigw.RestApi(
      this,
      "orders-db-api",
      {
        description: "orders db api gateway",
        deploy: true,
        deployOptions: {
          stageName: "prod",
          dataTraceEnabled: true,
          loggingLevel: apigw.MethodLoggingLevel.INFO,
          tracingEnabled: true,
          metricsEnabled: true,
        },
      }
    );

    // add an /orders-db resource
    const ordersDb: apigw.Resource = ordersDbApi.root.addResource("orders-db");

    // integrate the lambda to the method - GET /orders-db/id
    const order = ordersDb.addResource("{id}");
    order.addMethod(
      "GET",
      new apigw.LambdaIntegration(getOrderHandler, {
        proxy: true,
        allowTestInvoke: true,
      })
    );

    // integrate the lambda to the method - POST /orders-db
    ordersDb.addMethod(
      "POST",
      new apigw.LambdaIntegration(createOrderHandler, {
        proxy: true,
        allowTestInvoke: true,
      })
    );

    // create the rest API for accessing our orders lambdas (connecting through the service layer)
    const ordersServiceLayerApi: apigw.RestApi = new apigw.RestApi(
      this,
      "orders-service-layer-api",
      {
        description: "orders service layer api gateway",
        deploy: true,
        deployOptions: {
          stageName: "prod",
          dataTraceEnabled: true,
          loggingLevel: apigw.MethodLoggingLevel.INFO,
          tracingEnabled: true,
          metricsEnabled: true,
        },
      }
    );

    // add an /orders resource
    const ordersServiceLayer: apigw.Resource =
      ordersServiceLayerApi.root.addResource("orders");

    // integrate the lambda to the method - GET /orders/id
    const orderServiceLayer = ordersServiceLayer.addResource("{id}");
    orderServiceLayer.addMethod(
      "GET",
      new apigw.LambdaIntegration(getOrderServiceHandler, {
        proxy: true,
        allowTestInvoke: true,
      })
    );

    // integrate the lambda to the method - POST /orders
    ordersServiceLayer.addMethod(
      "POST",
      new apigw.LambdaIntegration(createOrderServiceHandler, {
        proxy: true,
        allowTestInvoke: true,
      })
    );
  }
}

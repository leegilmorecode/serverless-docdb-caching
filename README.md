# Serverless DocumentDB Connection Caching Service 🚀

![image](./docs/images/header.png)

## Introduction

How to cache database connections with your Serverless solutions when using Amazon DocumentDB with a dedicated data access service using Amazon ECS Fargate. The article can be found here: https://leejamesgilmore.medium.com/serverless-documentdb-connection-caching-service-part-1-23db3a3df6dc

> This is a minimal set of code to demonstrate the points discussed in the article, so coding and architecture best practices have not been adhered too (inc unit testing)

## Getting started

**Note: This will incur costs in your AWS account on running the load tests which you should account for.**

Please view the detailed deployment steps in the article.

## Removing the services

To remove the services run the following command in the docdb-cache-service-infra folder: `npm run remove`

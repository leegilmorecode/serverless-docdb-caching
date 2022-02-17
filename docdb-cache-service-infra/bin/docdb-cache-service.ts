#!/usr/bin/env node

import "source-map-support/register";

import * as cdk from "aws-cdk-lib";

import { DocdbCacheServiceStack } from "../lib/docdb-cache-service-stack";

const app = new cdk.App();
new DocdbCacheServiceStack(app, "DocdbCacheServiceStack", {});

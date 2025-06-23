import { z } from "zod";

import { TFlyioConnection } from "@app/services/app-connection/flyio";

import { CreateFlyioSyncSchema, FlyioSyncListItemSchema, FlyioSyncSchema } from "./flyio-sync-schemas";

export type TFlyioSync = z.infer<typeof FlyioSyncSchema>;

export type TFlyioSyncInput = z.infer<typeof CreateFlyioSyncSchema>;

export type TFlyioSyncListItem = z.infer<typeof FlyioSyncListItemSchema>;

export type TFlyioSyncWithCredentials = TFlyioSync & {
  connection: TFlyioConnection;
};

export type TFlyioSecret = {
  name: string;
};

export type TFlyioListVariables = {
  accessToken: string;
  appId: string;
};

export type TPutFlyioVariable = TFlyioListVariables & {
  secretMap: { [key: string]: { value: string } };
};

export type TDeleteFlyioVariable = TFlyioListVariables & {
  keys: string[];
};

import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TFlyioSync = TRootSecretSync & {
  destination: SecretSync.Flyio;
  destinationConfig: {
    appId: string;
  };
  connection: {
    app: AppConnection.Flyio;
    name: string;
    id: string;
  };
};

import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export type TSqlCredentialsRotationProperties = {
  parameters: {
    username1: string;
    username2: string;
  };
  secretsMapping: {
    username: string;
    password: string;
  };
};

export type TSqlCredentialsRotationOption = {
  name: string;
  type: SecretRotation.PostgresCredentials | SecretRotation.MsSqlCredentials;
  connection: AppConnection.Postgres | AppConnection.MsSql;
  template: {
    secretsMapping: TSqlCredentialsRotationProperties["secretsMapping"];
    createUserStatement: string;
  };
};

export type TSqlCredentialsRotationGeneratedCredentials = {
  username: string;
  password: string;
};

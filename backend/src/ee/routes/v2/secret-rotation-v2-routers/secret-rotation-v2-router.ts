import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { Auth0ClientSecretRotationListItemSchema } from "@app/ee/services/secret-rotation-v2/auth0-client-secret";
import { MsSqlCredentialsRotationListItemSchema } from "@app/ee/services/secret-rotation-v2/mssql-credentials";
import { PostgresCredentialsRotationListItemSchema } from "@app/ee/services/secret-rotation-v2/postgres-credentials";
import { SecretRotationV2Schema } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-union-schema";
import { SecretRotations } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SecretRotationV2OptionsSchema = z.discriminatedUnion("type", [
  PostgresCredentialsRotationListItemSchema,
  MsSqlCredentialsRotationListItemSchema,
  Auth0ClientSecretRotationListItemSchema
]);

export const registerSecretRotationV2Router = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/options",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List the available Secret Rotation Options.",
      response: {
        200: z.object({
          secretRotationOptions: SecretRotationV2OptionsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: () => {
      const secretRotationOptions = server.services.secretRotationV2.listSecretRotationOptions();
      return { secretRotationOptions };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List all the Secret Rotations for the specified project.",
      querystring: z.object({
        projectId: z.string().trim().min(1, "Project ID required").describe(SecretRotations.LIST().projectId)
      }),
      response: {
        200: z.object({ secretRotations: SecretRotationV2Schema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        query: { projectId },
        permission
      } = req;

      const secretRotations = await server.services.secretRotationV2.listSecretRotationsByProjectId(
        { projectId },
        permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.GET_SECRET_ROTATIONS,
          metadata: {
            rotationIds: secretRotations.map((sync) => sync.id),
            count: secretRotations.length
          }
        }
      });

      return { secretRotations };
    }
  });
};

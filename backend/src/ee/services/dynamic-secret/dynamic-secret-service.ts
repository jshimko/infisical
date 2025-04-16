import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrderByDirection, OrgServiceActor } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TResourceMetadataDALFactory } from "@app/services/resource-metadata/resource-metadata-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

import { TDynamicSecretLeaseDALFactory } from "../dynamic-secret-lease/dynamic-secret-lease-dal";
import { TDynamicSecretLeaseQueueServiceFactory } from "../dynamic-secret-lease/dynamic-secret-lease-queue";
import { TProjectGatewayDALFactory } from "../gateway/project-gateway-dal";
import { TDynamicSecretDALFactory } from "./dynamic-secret-dal";
import {
  DynamicSecretStatus,
  TCreateDynamicSecretDTO,
  TDeleteDynamicSecretDTO,
  TDetailsDynamicSecretDTO,
  TGetDynamicSecretsCountDTO,
  TListDynamicSecretsByFolderMappingsDTO,
  TListDynamicSecretsDTO,
  TListDynamicSecretsMultiEnvDTO,
  TUpdateDynamicSecretDTO
} from "./dynamic-secret-types";
import { AzureEntraIDProvider } from "./providers/azure-entra-id";
import { DynamicSecretProviders, TDynamicProviderFns } from "./providers/models";

type TDynamicSecretServiceFactoryDep = {
  dynamicSecretDAL: TDynamicSecretDALFactory;
  dynamicSecretLeaseDAL: Pick<TDynamicSecretLeaseDALFactory, "find">;
  dynamicSecretProviders: Record<DynamicSecretProviders, TDynamicProviderFns>;
  dynamicSecretQueueService: Pick<
    TDynamicSecretLeaseQueueServiceFactory,
    "pruneDynamicSecret" | "unsetLeaseRevocation"
  >;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath" | "findBySecretPathMultiEnv">;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  projectGatewayDAL: Pick<TProjectGatewayDALFactory, "findOne">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany" | "delete">;
};

export type TDynamicSecretServiceFactory = ReturnType<typeof dynamicSecretServiceFactory>;

export const dynamicSecretServiceFactory = ({
  dynamicSecretDAL,
  dynamicSecretLeaseDAL,
  licenseService,
  folderDAL,
  dynamicSecretProviders,
  permissionService,
  dynamicSecretQueueService,
  projectDAL,
  kmsService,
  projectGatewayDAL,
  resourceMetadataDAL
}: TDynamicSecretServiceFactoryDep) => {
  const create = async ({
    path,
    actor,
    name,
    actorId,
    maxTTL,
    provider,
    environmentSlug,
    projectSlug,
    actorOrgId,
    defaultTTL,
    actorAuthMethod,
    metadata
  }: TCreateDynamicSecretDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const projectId = project.id;
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.CreateRootCredential,
      subject(ProjectPermissionSub.DynamicSecrets, { environment: environmentSlug, secretPath: path, metadata })
    );

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan?.dynamicSecret) {
      throw new BadRequestError({
        message: "Failed to create dynamic secret due to plan restriction. Upgrade plan to create dynamic secret."
      });
    }

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder) {
      throw new NotFoundError({ message: `Folder with path '${path}' in environment '${environmentSlug}' not found` });
    }

    const existingDynamicSecret = await dynamicSecretDAL.findOne({ name, folderId: folder.id });
    if (existingDynamicSecret)
      throw new BadRequestError({ message: "Provided dynamic secret already exist under the folder" });

    const selectedProvider = dynamicSecretProviders[provider.type];
    const inputs = await selectedProvider.validateProviderInputs(provider.inputs);

    let selectedGatewayId: string | null = null;
    if (inputs && typeof inputs === "object" && "projectGatewayId" in inputs && inputs.projectGatewayId) {
      const projectGatewayId = inputs.projectGatewayId as string;

      const projectGateway = await projectGatewayDAL.findOne({ id: projectGatewayId, projectId });
      if (!projectGateway)
        throw new NotFoundError({
          message: `Project gateway with ${projectGatewayId} not found`
        });
      selectedGatewayId = projectGateway.id;
    }

    const isConnected = await selectedProvider.validateConnection(provider.inputs);
    if (!isConnected) throw new BadRequestError({ message: "Provider connection failed" });

    const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const dynamicSecretCfg = await dynamicSecretDAL.transaction(async (tx) => {
      const cfg = await dynamicSecretDAL.create(
        {
          type: provider.type,
          version: 1,
          encryptedInput: secretManagerEncryptor({ plainText: Buffer.from(JSON.stringify(inputs)) }).cipherTextBlob,
          maxTTL,
          defaultTTL,
          folderId: folder.id,
          name,
          projectGatewayId: selectedGatewayId
        },
        tx
      );

      if (metadata) {
        await resourceMetadataDAL.insertMany(
          metadata.map(({ key, value }) => ({
            key,
            value,
            dynamicSecretId: cfg.id,
            orgId: actorOrgId
          })),
          tx
        );
      }

      return cfg;
    });

    return dynamicSecretCfg;
  };

  const updateByName = async ({
    name,
    maxTTL,
    defaultTTL,
    inputs,
    environmentSlug,
    projectSlug,
    path,
    actor,
    actorId,
    newName,
    actorOrgId,
    actorAuthMethod,
    metadata
  }: TUpdateDynamicSecretDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const projectId = project.id;

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan?.dynamicSecret) {
      throw new BadRequestError({
        message: "Failed to update dynamic secret due to plan restriction. Upgrade plan to create dynamic secret."
      });
    }

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder)
      throw new NotFoundError({ message: `Folder with path '${path}' in environment '${environmentSlug}' not found` });

    const dynamicSecretCfg = await dynamicSecretDAL.findOne({ name, folderId: folder.id });
    if (!dynamicSecretCfg) {
      throw new NotFoundError({
        message: `Dynamic secret with name '${name}' in folder '${folder.path}' not found`
      });
    }

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.EditRootCredential,
      subject(ProjectPermissionSub.DynamicSecrets, {
        environment: environmentSlug,
        secretPath: path,
        metadata: dynamicSecretCfg.metadata
      })
    );

    if (metadata) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionDynamicSecretActions.EditRootCredential,
        subject(ProjectPermissionSub.DynamicSecrets, {
          environment: environmentSlug,
          secretPath: path,
          metadata
        })
      );
    }

    if (newName) {
      const existingDynamicSecret = await dynamicSecretDAL.findOne({ name: newName, folderId: folder.id });
      if (existingDynamicSecret)
        throw new BadRequestError({ message: "Provided dynamic secret already exist under the folder" });
    }
    const { encryptor: secretManagerEncryptor, decryptor: secretManagerDecryptor } =
      await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });

    const selectedProvider = dynamicSecretProviders[dynamicSecretCfg.type as DynamicSecretProviders];
    const decryptedStoredInput = JSON.parse(
      secretManagerDecryptor({ cipherTextBlob: dynamicSecretCfg.encryptedInput }).toString()
    ) as object;
    const newInput = { ...decryptedStoredInput, ...(inputs || {}) };
    const updatedInput = await selectedProvider.validateProviderInputs(newInput);

    let selectedGatewayId: string | null = null;
    if (
      updatedInput &&
      typeof updatedInput === "object" &&
      "projectGatewayId" in updatedInput &&
      updatedInput?.projectGatewayId
    ) {
      const projectGatewayId = updatedInput.projectGatewayId as string;

      const projectGateway = await projectGatewayDAL.findOne({ id: projectGatewayId, projectId });
      if (!projectGateway)
        throw new NotFoundError({
          message: `Project gateway with ${projectGatewayId} not found`
        });
      selectedGatewayId = projectGateway.id;
    }

    const isConnected = await selectedProvider.validateConnection(newInput);
    if (!isConnected) throw new BadRequestError({ message: "Provider connection failed" });

    const updatedDynamicCfg = await dynamicSecretDAL.transaction(async (tx) => {
      const cfg = await dynamicSecretDAL.updateById(
        dynamicSecretCfg.id,
        {
          encryptedInput: secretManagerEncryptor({ plainText: Buffer.from(JSON.stringify(updatedInput)) })
            .cipherTextBlob,
          maxTTL,
          defaultTTL,
          name: newName ?? name,
          status: null,
          projectGatewayId: selectedGatewayId
        },
        tx
      );

      if (metadata) {
        await resourceMetadataDAL.delete(
          {
            dynamicSecretId: cfg.id
          },
          tx
        );

        await resourceMetadataDAL.insertMany(
          metadata.map(({ key, value }) => ({
            key,
            value,
            dynamicSecretId: cfg.id,
            orgId: actorOrgId
          })),
          tx
        );
      }

      return cfg;
    });

    return updatedDynamicCfg;
  };

  const deleteByName = async ({
    actorAuthMethod,
    actorOrgId,
    actorId,
    actor,
    projectSlug,
    name,
    path,
    environmentSlug,
    isForced
  }: TDeleteDynamicSecretDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const projectId = project.id;

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder)
      throw new NotFoundError({ message: `Folder with path '${path}' in environment '${environmentSlug}' not found` });

    const dynamicSecretCfg = await dynamicSecretDAL.findOne({ name, folderId: folder.id });
    if (!dynamicSecretCfg) {
      throw new NotFoundError({ message: `Dynamic secret with name '${name}' in folder '${folder.path}' not found` });
    }

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.DeleteRootCredential,
      subject(ProjectPermissionSub.DynamicSecrets, {
        environment: environmentSlug,
        secretPath: path,
        metadata: dynamicSecretCfg.metadata
      })
    );

    const leases = await dynamicSecretLeaseDAL.find({ dynamicSecretId: dynamicSecretCfg.id });
    // when not forced we check with the external system to first remove the things
    // we introduce a forced concept because consider the external lease got deleted by some other external like a human or another system
    // this allows user to clean up it from infisical
    if (isForced) {
      // clear all queues for lease revocations
      await Promise.all(leases.map(({ id: leaseId }) => dynamicSecretQueueService.unsetLeaseRevocation(leaseId)));

      const deletedDynamicSecretCfg = await dynamicSecretDAL.deleteById(dynamicSecretCfg.id);
      return deletedDynamicSecretCfg;
    }
    // if leases exist we should flag it as deleting and then remove leases in background
    // then delete the main one
    if (leases.length) {
      const updatedDynamicSecretCfg = await dynamicSecretDAL.updateById(dynamicSecretCfg.id, {
        status: DynamicSecretStatus.Deleting
      });
      await dynamicSecretQueueService.pruneDynamicSecret(updatedDynamicSecretCfg.id);
      return updatedDynamicSecretCfg;
    }
    // if no leases just delete the config
    const deletedDynamicSecretCfg = await dynamicSecretDAL.deleteById(dynamicSecretCfg.id);
    return deletedDynamicSecretCfg;
  };

  const getDetails = async ({
    name,
    projectSlug,
    path,
    environmentSlug,
    actorAuthMethod,
    actorOrgId,
    actorId,
    actor
  }: TDetailsDynamicSecretDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const projectId = project.id;
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder)
      throw new NotFoundError({ message: `Folder with path '${path}' in environment '${environmentSlug}' not found` });

    const dynamicSecretCfg = await dynamicSecretDAL.findOne({ name, folderId: folder.id });
    if (!dynamicSecretCfg) {
      throw new NotFoundError({ message: `Dynamic secret with name '${name} in folder '${path}' not found` });
    }

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.ReadRootCredential,
      subject(ProjectPermissionSub.DynamicSecrets, {
        environment: environmentSlug,
        secretPath: path,
        metadata: dynamicSecretCfg.metadata
      })
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.EditRootCredential,
      subject(ProjectPermissionSub.DynamicSecrets, {
        environment: environmentSlug,
        secretPath: path,
        metadata: dynamicSecretCfg.metadata
      })
    );

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const decryptedStoredInput = JSON.parse(
      secretManagerDecryptor({ cipherTextBlob: dynamicSecretCfg.encryptedInput }).toString()
    ) as object;
    const selectedProvider = dynamicSecretProviders[dynamicSecretCfg.type as DynamicSecretProviders];
    const providerInputs = (await selectedProvider.validateProviderInputs(decryptedStoredInput)) as object;

    return { ...dynamicSecretCfg, inputs: providerInputs };
  };

  // get unique dynamic secret count across multiple envs
  const getCountMultiEnv = async ({
    actorAuthMethod,
    actorOrgId,
    actorId,
    actor,
    projectId,
    path,
    environmentSlugs,
    search,
    isInternal
  }: TListDynamicSecretsMultiEnvDTO) => {
    if (!isInternal) {
      const { permission } = await permissionService.getProjectPermission({
        actor,
        actorId,
        projectId,
        actorAuthMethod,
        actorOrgId,
        actionProjectType: ActionProjectType.SecretManager
      });

      // verify user has access to each env in request
      environmentSlugs.forEach((environmentSlug) =>
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionDynamicSecretActions.ReadRootCredential,
          subject(ProjectPermissionSub.DynamicSecrets, { environment: environmentSlug, secretPath: path })
        )
      );
    }

    const folders = await folderDAL.findBySecretPathMultiEnv(projectId, environmentSlugs, path);
    if (!folders.length) {
      throw new NotFoundError({
        message: `Folders with path '${path}' in environments with slugs '${environmentSlugs.join(", ")}' not found`
      });
    }

    const dynamicSecretCfg = await dynamicSecretDAL.find(
      { $in: { folderId: folders.map((folder) => folder.id) }, $search: search ? { name: `%${search}%` } : undefined },
      { countDistinct: "name" }
    );

    return Number(dynamicSecretCfg[0]?.count ?? 0);
  };

  // get dynamic secret count for a single env
  const getDynamicSecretCount = async ({
    actorAuthMethod,
    actorOrgId,
    actorId,
    actor,
    path,
    environmentSlug,
    search,
    projectId
  }: TGetDynamicSecretsCountDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.ReadRootCredential,
      ProjectPermissionSub.DynamicSecrets
    );

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder) {
      throw new NotFoundError({ message: `Folder with path '${path}' in environment '${environmentSlug}' not found` });
    }

    const dynamicSecretCfg = await dynamicSecretDAL.find(
      { folderId: folder.id, $search: search ? { name: `%${search}%` } : undefined },
      { count: true }
    );
    return Number(dynamicSecretCfg[0]?.count ?? 0);
  };

  const listDynamicSecretsByEnv = async ({
    actorAuthMethod,
    actorOrgId,
    actorId,
    actor,
    projectSlug,
    path,
    environmentSlug,
    limit,
    offset,
    orderBy,
    orderDirection = OrderByDirection.ASC,
    search,
    ...params
  }: TListDynamicSecretsDTO) => {
    let { projectId } = params;

    if (!projectId) {
      if (!projectSlug) throw new BadRequestError({ message: "Project ID or slug required" });
      const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
      if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });
      projectId = project.id;
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder)
      throw new NotFoundError({ message: `Folder with path '${path}' in environment '${environmentSlug}' not found` });

    const dynamicSecretCfg = await dynamicSecretDAL.findWithMetadata(
      { folderId: folder.id, $search: search ? { name: `%${search}%` } : undefined },
      {
        limit,
        offset,
        sort: orderBy ? [[orderBy, orderDirection]] : undefined
      }
    );

    return dynamicSecretCfg.filter((dynamicSecret) => {
      return permission.can(
        ProjectPermissionDynamicSecretActions.ReadRootCredential,
        subject(ProjectPermissionSub.DynamicSecrets, {
          environment: environmentSlug,
          secretPath: path,
          metadata: dynamicSecret.metadata
        })
      );
    });
  };

  const listDynamicSecretsByFolderIds = async (
    { folderMappings, filters, projectId }: TListDynamicSecretsByFolderMappingsDTO,
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const userAccessibleFolderMappings = folderMappings.filter(({ path, environment }) =>
      permission.can(
        ProjectPermissionDynamicSecretActions.ReadRootCredential,
        subject(ProjectPermissionSub.DynamicSecrets, { environment, secretPath: path })
      )
    );

    const groupedFolderMappings = new Map(userAccessibleFolderMappings.map((path) => [path.folderId, path]));

    const dynamicSecrets = await dynamicSecretDAL.listDynamicSecretsByFolderIds({
      folderIds: userAccessibleFolderMappings.map(({ folderId }) => folderId),
      ...filters
    });

    return dynamicSecrets.map((dynamicSecret) => {
      const { environment, path } = groupedFolderMappings.get(dynamicSecret.folderId)!;
      return {
        ...dynamicSecret,
        environment,
        path
      };
    });
  };

  // get dynamic secrets for multiple envs
  const listDynamicSecretsByEnvs = async ({
    actorAuthMethod,
    actorOrgId,
    actorId,
    actor,
    path,
    environmentSlugs,
    projectId,
    isInternal,
    ...params
  }: TListDynamicSecretsMultiEnvDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const folders = await folderDAL.findBySecretPathMultiEnv(projectId, environmentSlugs, path);
    if (!folders.length)
      throw new NotFoundError({
        message: `Folders with path '${path} in environments with slugs '${environmentSlugs.join(", ")}' not found`
      });

    const dynamicSecretCfg = await dynamicSecretDAL.listDynamicSecretsByFolderIds({
      folderIds: folders.map((folder) => folder.id),
      ...params
    });

    return dynamicSecretCfg.filter((dynamicSecret) => {
      return permission.can(
        ProjectPermissionDynamicSecretActions.ReadRootCredential,
        subject(ProjectPermissionSub.DynamicSecrets, {
          environment: dynamicSecret.environment,
          secretPath: path,
          metadata: dynamicSecret.metadata
        })
      );
    });
  };

  const fetchAzureEntraIdUsers = async ({
    tenantId,
    applicationId,
    clientSecret
  }: {
    tenantId: string;
    applicationId: string;
    clientSecret: string;
  }) => {
    const azureEntraIdUsers = await AzureEntraIDProvider().fetchAzureEntraIdUsers(
      tenantId,
      applicationId,
      clientSecret
    );
    return azureEntraIdUsers;
  };

  return {
    create,
    updateByName,
    deleteByName,
    getDetails,
    listDynamicSecretsByEnv,
    listDynamicSecretsByEnvs,
    getDynamicSecretCount,
    getCountMultiEnv,
    fetchAzureEntraIdUsers,
    listDynamicSecretsByFolderIds
  };
};

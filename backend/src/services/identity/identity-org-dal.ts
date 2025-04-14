import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  TableName,
  TIdentityAwsAuths,
  TIdentityAzureAuths,
  TIdentityGcpAuths,
  TIdentityJwtAuths,
  TIdentityKubernetesAuths,
  TIdentityOidcAuths,
  TIdentityOrgMemberships,
  TIdentityTokenAuths,
  TIdentityUniversalAuths,
  TOrgRoles
} from "@app/db/schemas";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import { buildKnexFilterForSearchResource } from "@app/lib/search-resource/db";
import { OrderByDirection } from "@app/lib/types";
import {
  OrgIdentityOrderBy,
  TListOrgIdentitiesByOrgIdDTO,
  TSearchOrgIdentitiesByOrgIdDAL
} from "@app/services/identity/identity-types";

import { buildAuthMethods } from "./identity-fns";

export type TIdentityOrgDALFactory = ReturnType<typeof identityOrgDALFactory>;

export const identityOrgDALFactory = (db: TDbClient) => {
  const identityOrgOrm = ormify(db, TableName.IdentityOrgMembership);

  const findOne = async (filter: Partial<TIdentityOrgMemberships>, tx?: Knex) => {
    try {
      const [data] = await (tx || db.replicaNode())(TableName.IdentityOrgMembership)
        .where((queryBuilder) => {
          Object.entries(filter).forEach(([key, value]) => {
            void queryBuilder.where(`${TableName.IdentityOrgMembership}.${key}`, value);
          });
        })
        .join(TableName.Identity, `${TableName.IdentityOrgMembership}.identityId`, `${TableName.Identity}.id`)

        .leftJoin<TIdentityUniversalAuths>(
          TableName.IdentityUniversalAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityUniversalAuth}.identityId`
        )
        .leftJoin<TIdentityGcpAuths>(
          TableName.IdentityGcpAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityGcpAuth}.identityId`
        )
        .leftJoin<TIdentityAwsAuths>(
          TableName.IdentityAwsAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityAwsAuth}.identityId`
        )
        .leftJoin<TIdentityKubernetesAuths>(
          TableName.IdentityKubernetesAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityKubernetesAuth}.identityId`
        )
        .leftJoin<TIdentityOidcAuths>(
          TableName.IdentityOidcAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityOidcAuth}.identityId`
        )
        .leftJoin<TIdentityAzureAuths>(
          TableName.IdentityAzureAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityAzureAuth}.identityId`
        )
        .leftJoin<TIdentityTokenAuths>(
          TableName.IdentityTokenAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityTokenAuth}.identityId`
        )
        .leftJoin<TIdentityJwtAuths>(
          TableName.IdentityJwtAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityJwtAuth}.identityId`
        )

        .select(
          selectAllTableCols(TableName.IdentityOrgMembership),

          db.ref("id").as("uaId").withSchema(TableName.IdentityUniversalAuth),
          db.ref("id").as("gcpId").withSchema(TableName.IdentityGcpAuth),
          db.ref("id").as("awsId").withSchema(TableName.IdentityAwsAuth),
          db.ref("id").as("kubernetesId").withSchema(TableName.IdentityKubernetesAuth),
          db.ref("id").as("oidcId").withSchema(TableName.IdentityOidcAuth),
          db.ref("id").as("azureId").withSchema(TableName.IdentityAzureAuth),
          db.ref("id").as("tokenId").withSchema(TableName.IdentityTokenAuth),
          db.ref("id").as("jwtId").withSchema(TableName.IdentityJwtAuth),

          db.ref("name").withSchema(TableName.Identity)
        );

      if (data) {
        const { name } = data;
        return {
          ...data,
          identity: {
            id: data.identityId,
            name,
            authMethods: buildAuthMethods(data)
          }
        };
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "FindOne" });
    }
  };

  const find = async (
    {
      limit,
      offset = 0,
      orderBy = OrgIdentityOrderBy.Name,
      orderDirection = OrderByDirection.ASC,
      search,
      ...filter
    }: Partial<TIdentityOrgMemberships> &
      Pick<TListOrgIdentitiesByOrgIdDTO, "offset" | "limit" | "orderBy" | "orderDirection" | "search">,
    tx?: Knex
  ) => {
    try {
      const paginatedIdentity = (tx || db.replicaNode())(TableName.Identity)
        .join(
          TableName.IdentityOrgMembership,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.Identity}.id`
        )
        .orderBy(`${TableName.Identity}.${orderBy}`, orderDirection)
        .select(
          selectAllTableCols(TableName.IdentityOrgMembership),
          db.ref("name").withSchema(TableName.Identity).as("identityName")
        )
        .where(filter)
        .as("paginatedIdentity");

      if (search?.length) {
        void paginatedIdentity.whereILike(`${TableName.Identity}.name`, `%${search}%`);
      }

      if (limit) {
        void paginatedIdentity.offset(offset).limit(limit);
      }

      // akhilmhdh: refer this for pagination with multiple left queries
      type TSubquery = Awaited<typeof paginatedIdentity>;
      const query = (tx || db.replicaNode())
        .from<TSubquery[number], TSubquery>(paginatedIdentity)
        .leftJoin<TOrgRoles>(TableName.OrgRoles, `paginatedIdentity.roleId`, `${TableName.OrgRoles}.id`)

        .leftJoin(TableName.IdentityMetadata, (queryBuilder) => {
          void queryBuilder
            .on(`paginatedIdentity.identityId`, `${TableName.IdentityMetadata}.identityId`)
            .andOn(`paginatedIdentity.orgId`, `${TableName.IdentityMetadata}.orgId`);
        })

        .leftJoin<TIdentityUniversalAuths>(
          TableName.IdentityUniversalAuth,
          "paginatedIdentity.identityId",
          `${TableName.IdentityUniversalAuth}.identityId`
        )
        .leftJoin<TIdentityGcpAuths>(
          TableName.IdentityGcpAuth,
          "paginatedIdentity.identityId",
          `${TableName.IdentityGcpAuth}.identityId`
        )
        .leftJoin<TIdentityAwsAuths>(
          TableName.IdentityAwsAuth,
          "paginatedIdentity.identityId",
          `${TableName.IdentityAwsAuth}.identityId`
        )
        .leftJoin<TIdentityKubernetesAuths>(
          TableName.IdentityKubernetesAuth,
          "paginatedIdentity.identityId",
          `${TableName.IdentityKubernetesAuth}.identityId`
        )
        .leftJoin<TIdentityOidcAuths>(
          TableName.IdentityOidcAuth,
          "paginatedIdentity.identityId",
          `${TableName.IdentityOidcAuth}.identityId`
        )
        .leftJoin<TIdentityAzureAuths>(
          TableName.IdentityAzureAuth,
          "paginatedIdentity.identityId",
          `${TableName.IdentityAzureAuth}.identityId`
        )
        .leftJoin<TIdentityTokenAuths>(
          TableName.IdentityTokenAuth,
          "paginatedIdentity.identityId",
          `${TableName.IdentityTokenAuth}.identityId`
        )
        .leftJoin<TIdentityJwtAuths>(
          TableName.IdentityJwtAuth,
          "paginatedIdentity.identityId",
          `${TableName.IdentityJwtAuth}.identityId`
        )
        .select(
          db.ref("id").withSchema("paginatedIdentity"),
          db.ref("role").withSchema("paginatedIdentity"),
          db.ref("roleId").withSchema("paginatedIdentity"),
          db.ref("orgId").withSchema("paginatedIdentity"),
          db.ref("createdAt").withSchema("paginatedIdentity"),
          db.ref("updatedAt").withSchema("paginatedIdentity"),
          db.ref("identityId").withSchema("paginatedIdentity").as("identityId"),
          db.ref("identityName").withSchema("paginatedIdentity"),

          db.ref("id").as("uaId").withSchema(TableName.IdentityUniversalAuth),
          db.ref("id").as("gcpId").withSchema(TableName.IdentityGcpAuth),
          db.ref("id").as("awsId").withSchema(TableName.IdentityAwsAuth),
          db.ref("id").as("kubernetesId").withSchema(TableName.IdentityKubernetesAuth),
          db.ref("id").as("oidcId").withSchema(TableName.IdentityOidcAuth),
          db.ref("id").as("azureId").withSchema(TableName.IdentityAzureAuth),
          db.ref("id").as("tokenId").withSchema(TableName.IdentityTokenAuth),
          db.ref("id").as("jwtId").withSchema(TableName.IdentityJwtAuth)
        )
        // cr stands for custom role
        .select(db.ref("id").as("crId").withSchema(TableName.OrgRoles))
        .select(db.ref("name").as("crName").withSchema(TableName.OrgRoles))
        .select(db.ref("slug").as("crSlug").withSchema(TableName.OrgRoles))
        .select(db.ref("description").as("crDescription").withSchema(TableName.OrgRoles))
        .select(db.ref("permissions").as("crPermission").withSchema(TableName.OrgRoles))
        .select(db.ref("permissions").as("crPermission").withSchema(TableName.OrgRoles))
        .select(
          db.ref("id").withSchema(TableName.IdentityMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.IdentityMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.IdentityMetadata).as("metadataValue")
        );
      if (orderBy === OrgIdentityOrderBy.Name) {
        void query.orderBy("identityName", orderDirection);
      }

      const docs = await query;
      const formattedDocs = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: ({
          crId,
          crDescription,
          crSlug,
          crPermission,
          crName,
          identityId,
          identityName,
          role,
          roleId,
          id,
          orgId,
          uaId,
          awsId,
          gcpId,
          jwtId,
          kubernetesId,
          oidcId,
          azureId,
          tokenId,
          createdAt,
          updatedAt
        }) => ({
          role,
          roleId,
          identityId,
          id,

          orgId,
          createdAt,
          updatedAt,
          customRole: roleId
            ? {
                id: crId,
                name: crName,
                slug: crSlug,
                permissions: crPermission,
                description: crDescription
              }
            : undefined,
          identity: {
            id: identityId,
            name: identityName,
            authMethods: buildAuthMethods({
              uaId,
              awsId,
              gcpId,
              kubernetesId,
              oidcId,
              azureId,
              tokenId,
              jwtId
            })
          }
        }),
        childrenMapper: [
          {
            key: "metadataId",
            label: "metadata" as const,
            mapper: ({ metadataKey, metadataValue, metadataId }) => ({
              id: metadataId,
              key: metadataKey,
              value: metadataValue
            })
          }
        ]
      });

      return formattedDocs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByOrgId" });
    }
  };

  const searchIdentities = async (
    {
      limit,
      offset = 0,
      orderBy = OrgIdentityOrderBy.Name,
      orderDirection = OrderByDirection.ASC,
      searchFilter,
      orgId
    }: TSearchOrgIdentitiesByOrgIdDAL,
    tx?: Knex
  ) => {
    try {
      const searchQuery = (tx || db.replicaNode())(TableName.IdentityOrgMembership)
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.IdentityOrgMembership}.identityId`)
        .where(`${TableName.IdentityOrgMembership}.orgId`, orgId)
        .leftJoin(TableName.OrgRoles, `${TableName.IdentityOrgMembership}.roleId`, `${TableName.OrgRoles}.id`)
        .orderBy(`${TableName.Identity}.${orderBy}`, orderDirection)
        .select(`${TableName.IdentityOrgMembership}.id`)
        .select<{ id: string; total_count: string }>(
          db.raw(
            `count(${TableName.IdentityOrgMembership}."identityId") OVER(PARTITION BY ${TableName.IdentityOrgMembership}."orgId") as total_count`
          )
        )
        .as("searchedIdentities");

      if (searchFilter) {
        buildKnexFilterForSearchResource(searchQuery, searchFilter, (attr) => {
          switch (attr) {
            case "role":
              return [`${TableName.OrgRoles}.slug`, `${TableName.IdentityOrgMembership}.role`];
            case "name":
              return `${TableName.Identity}.name`;
            default:
              throw new BadRequestError({ message: `Invalid ${String(attr)} provided` });
          }
        });
      }

      if (limit) {
        void searchQuery.offset(offset).limit(limit);
      }

      type TSubquery = Awaited<typeof searchQuery>;
      const query = (tx || db.replicaNode())(TableName.IdentityOrgMembership)
        .where(`${TableName.IdentityOrgMembership}.orgId`, orgId)
        .join<TSubquery>(searchQuery, `${TableName.IdentityOrgMembership}.id`, "searchedIdentities.id")
        .join(TableName.Identity, `${TableName.IdentityOrgMembership}.identityId`, `${TableName.Identity}.id`)
        .leftJoin(TableName.OrgRoles, `${TableName.IdentityOrgMembership}.roleId`, `${TableName.OrgRoles}.id`)
        .leftJoin(TableName.IdentityMetadata, (queryBuilder) => {
          void queryBuilder
            .on(`${TableName.IdentityOrgMembership}.identityId`, `${TableName.IdentityMetadata}.identityId`)
            .andOn(`${TableName.IdentityOrgMembership}.orgId`, `${TableName.IdentityMetadata}.orgId`);
        })
        .leftJoin(
          TableName.IdentityUniversalAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityUniversalAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityGcpAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityGcpAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityAwsAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityAwsAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityKubernetesAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityKubernetesAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityOidcAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityOidcAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityAzureAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityAzureAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityTokenAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityTokenAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityJwtAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityJwtAuth}.identityId`
        )
        .select(
          db.ref("id").withSchema(TableName.IdentityOrgMembership),
          db.ref("total_count").withSchema("searchedIdentities"),
          db.ref("role").withSchema(TableName.IdentityOrgMembership),
          db.ref("roleId").withSchema(TableName.IdentityOrgMembership),
          db.ref("orgId").withSchema(TableName.IdentityOrgMembership),
          db.ref("createdAt").withSchema(TableName.IdentityOrgMembership),
          db.ref("updatedAt").withSchema(TableName.IdentityOrgMembership),
          db.ref("identityId").withSchema(TableName.IdentityOrgMembership).as("identityId"),
          db.ref("name").withSchema(TableName.Identity).as("identityName"),

          db.ref("id").as("uaId").withSchema(TableName.IdentityUniversalAuth),
          db.ref("id").as("gcpId").withSchema(TableName.IdentityGcpAuth),
          db.ref("id").as("awsId").withSchema(TableName.IdentityAwsAuth),
          db.ref("id").as("kubernetesId").withSchema(TableName.IdentityKubernetesAuth),
          db.ref("id").as("oidcId").withSchema(TableName.IdentityOidcAuth),
          db.ref("id").as("azureId").withSchema(TableName.IdentityAzureAuth),
          db.ref("id").as("tokenId").withSchema(TableName.IdentityTokenAuth),
          db.ref("id").as("jwtId").withSchema(TableName.IdentityJwtAuth)
        )
        // cr stands for custom role
        .select(db.ref("id").as("crId").withSchema(TableName.OrgRoles))
        .select(db.ref("name").as("crName").withSchema(TableName.OrgRoles))
        .select(db.ref("slug").as("crSlug").withSchema(TableName.OrgRoles))
        .select(db.ref("description").as("crDescription").withSchema(TableName.OrgRoles))
        .select(db.ref("permissions").as("crPermission").withSchema(TableName.OrgRoles))
        .select(db.ref("permissions").as("crPermission").withSchema(TableName.OrgRoles))
        .select(
          db.ref("id").withSchema(TableName.IdentityMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.IdentityMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.IdentityMetadata).as("metadataValue")
        );

      if (orderBy === OrgIdentityOrderBy.Name) {
        void query.orderBy("identityName", orderDirection);
      }

      const docs = await query;
      const formattedDocs = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: ({
          crId,
          crDescription,
          crSlug,
          crPermission,
          crName,
          identityId,
          identityName,
          role,
          roleId,
          total_count,
          id,
          uaId,
          awsId,
          gcpId,
          jwtId,
          kubernetesId,
          oidcId,
          azureId,
          tokenId,
          createdAt,
          updatedAt
        }) => ({
          role,
          roleId,
          identityId,
          id,
          total_count: total_count as string,
          orgId,
          createdAt,
          updatedAt,
          customRole: roleId
            ? {
                id: crId,
                name: crName,
                slug: crSlug,
                permissions: crPermission,
                description: crDescription
              }
            : undefined,
          identity: {
            id: identityId,
            name: identityName,
            authMethods: buildAuthMethods({
              uaId,
              awsId,
              gcpId,
              kubernetesId,
              oidcId,
              azureId,
              tokenId,
              jwtId
            })
          }
        }),
        childrenMapper: [
          {
            key: "metadataId",
            label: "metadata" as const,
            mapper: ({ metadataKey, metadataValue, metadataId }) => ({
              id: metadataId,
              key: metadataKey,
              value: metadataValue
            })
          }
        ]
      });

      return { docs: formattedDocs, totalCount: Number(formattedDocs?.[0]?.total_count ?? 0) };
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByOrgId" });
    }
  };

  const countAllOrgIdentities = async (
    { search, ...filter }: Partial<TIdentityOrgMemberships> & Pick<TListOrgIdentitiesByOrgIdDTO, "search">,
    tx?: Knex
  ) => {
    try {
      const query = (tx || db.replicaNode())(TableName.IdentityOrgMembership)
        .where(filter)
        .join(TableName.Identity, `${TableName.IdentityOrgMembership}.identityId`, `${TableName.Identity}.id`)
        .count();

      if (search?.length) {
        void query.whereILike(`${TableName.Identity}.name`, `%${search}%`);
      }

      const identities = await query;

      return Number(identities[0].count);
    } catch (error) {
      throw new DatabaseError({ error, name: "countAllOrgIdentities" });
    }
  };

  return { ...identityOrgOrm, find, findOne, countAllOrgIdentities, searchIdentities };
};

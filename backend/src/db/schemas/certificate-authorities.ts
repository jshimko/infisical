// Code generated by automation script, DO NOT EDIT.
// Automated by pulling database and generating zod schema
// To update. Just run npm run generate:schema
// Written by akhilmhdh.

import { z } from "zod";



import { TImmutableDBKeys } from "./models";

export const CertificateAuthoritiesSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
  parentCaId: z.string().uuid().nullable().optional(),
  projectId: z.string(),
  type: z.string(),
  status: z.string(),
  friendlyName: z.string(),
  organization: z.string(),
  ou: z.string(),
  country: z.string(),
  province: z.string(),
  locality: z.string(),
  commonName: z.string(),
  dn: z.string(),
  serialNumber: z.string().nullable().optional(),
  maxPathLength: z.number().nullable().optional(),
  keyAlgorithm: z.string(),
  notBefore: z.date().nullable().optional(),
  notAfter: z.date().nullable().optional(),
  activeCaCertId: z.string().uuid().nullable().optional(),
  requireTemplateForIssuance: z.boolean().default(false)
});

export type TCertificateAuthorities = z.infer<typeof CertificateAuthoritiesSchema>;
export type TCertificateAuthoritiesInsert = Omit<z.input<typeof CertificateAuthoritiesSchema>, TImmutableDBKeys>;
export type TCertificateAuthoritiesUpdate = Partial<Omit<z.input<typeof CertificateAuthoritiesSchema>, TImmutableDBKeys>>;

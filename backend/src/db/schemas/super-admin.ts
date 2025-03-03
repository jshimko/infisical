// Code generated by automation script, DO NOT EDIT.
// Automated by pulling database and generating zod schema
// To update. Just run npm run generate:schema
// Written by akhilmhdh.

import { z } from "zod";

import { zodBuffer } from "@app/lib/zod";

import { TImmutableDBKeys } from "./models";

export const SuperAdminSchema = z.object({
  id: z.string().uuid(),
  initialized: z.boolean().default(false).nullable().optional(),
  allowSignUp: z.boolean().default(true).nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  allowedSignUpDomain: z.string().nullable().optional(),
  instanceId: z.string().uuid().default("00000000-0000-0000-0000-000000000000"),
  trustSamlEmails: z.boolean().default(false).nullable().optional(),
  trustLdapEmails: z.boolean().default(false).nullable().optional(),
  trustOidcEmails: z.boolean().default(false).nullable().optional(),
  defaultAuthOrgId: z.string().uuid().nullable().optional(),
  enabledLoginMethods: z.string().array().nullable().optional(),
  encryptedSlackClientId: zodBuffer.nullable().optional(),
  encryptedSlackClientSecret: zodBuffer.nullable().optional(),
  authConsentContent: z.string().nullable().optional(),
  pageFrameContent: z.string().nullable().optional()
});

export type TSuperAdmin = z.infer<typeof SuperAdminSchema>;
export type TSuperAdminInsert = Omit<z.input<typeof SuperAdminSchema>, TImmutableDBKeys>;
export type TSuperAdminUpdate = Partial<Omit<z.input<typeof SuperAdminSchema>, TImmutableDBKeys>>;

// Code generated by automation script, DO NOT EDIT.
// Automated by pulling database and generating zod schema
// To update. Just run npm run generate:schema
// Written by akhilmhdh.

import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const SshHostLoginUserMappingsSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
  sshHostLoginUserId: z.string().uuid(),
  userId: z.string().uuid().nullable().optional(),
  groupId: z.string().uuid().nullable().optional()
});

export type TSshHostLoginUserMappings = z.infer<typeof SshHostLoginUserMappingsSchema>;
export type TSshHostLoginUserMappingsInsert = Omit<z.input<typeof SshHostLoginUserMappingsSchema>, TImmutableDBKeys>;
export type TSshHostLoginUserMappingsUpdate = Partial<
  Omit<z.input<typeof SshHostLoginUserMappingsSchema>, TImmutableDBKeys>
>;

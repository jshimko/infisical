// Code generated by automation script, DO NOT EDIT.
// Automated by pulling database and generating zod schema
// To update. Just run npm run generate:schema
// Written by akhilmhdh.

import { z } from "zod";



import { TImmutableDBKeys } from "./models";

export const SecretVersionV2TagJunctionSchema = z.object({
  id: z.string().uuid(),
  secret_versions_v2Id: z.string().uuid(),
  secret_tagsId: z.string().uuid()
});

export type TSecretVersionV2TagJunction = z.infer<typeof SecretVersionV2TagJunctionSchema>;
export type TSecretVersionV2TagJunctionInsert = Omit<z.input<typeof SecretVersionV2TagJunctionSchema>, TImmutableDBKeys>;
export type TSecretVersionV2TagJunctionUpdate = Partial<Omit<z.input<typeof SecretVersionV2TagJunctionSchema>, TImmutableDBKeys>>;

// Code generated by automation script, DO NOT EDIT.
// Automated by pulling database and generating zod schema
// To update. Just run npm run generate:schema
// Written by akhilmhdh.

import { z } from "zod";



import { TImmutableDBKeys } from "./models";

export const AuthTokensSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  phoneNumber: z.string().nullable().optional(),
  tokenHash: z.string(),
  triesLeft: z.number().nullable().optional(),
  expiresAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
  userId: z.string().uuid().nullable().optional(),
  orgId: z.string().uuid().nullable().optional()
});

export type TAuthTokens = z.infer<typeof AuthTokensSchema>;
export type TAuthTokensInsert = Omit<z.input<typeof AuthTokensSchema>, TImmutableDBKeys>;
export type TAuthTokensUpdate = Partial<Omit<z.input<typeof AuthTokensSchema>, TImmutableDBKeys>>;

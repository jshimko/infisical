// Code generated by automation script, DO NOT EDIT.
// Automated by pulling database and generating zod schema
// To update. Just run npm run generate:schema
// Written by akhilmhdh.

import { z } from "zod";



import { TImmutableDBKeys } from "./models";

export const IncidentContactsSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  orgId: z.string().uuid()
});

export type TIncidentContacts = z.infer<typeof IncidentContactsSchema>;
export type TIncidentContactsInsert = Omit<z.input<typeof IncidentContactsSchema>, TImmutableDBKeys>;
export type TIncidentContactsUpdate = Partial<Omit<z.input<typeof IncidentContactsSchema>, TImmutableDBKeys>>;

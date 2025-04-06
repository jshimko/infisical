// Code generated by automation script, DO NOT EDIT.
// Automated by pulling database and generating zod schema
// To update. Just run npm run generate:schema
// Written by akhilmhdh.

import { z } from "zod";



import { TImmutableDBKeys } from "./models";

export const GroupProjectMembershipsSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string(),
  groupId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type TGroupProjectMemberships = z.infer<typeof GroupProjectMembershipsSchema>;
export type TGroupProjectMembershipsInsert = Omit<z.input<typeof GroupProjectMembershipsSchema>, TImmutableDBKeys>;
export type TGroupProjectMembershipsUpdate = Partial<Omit<z.input<typeof GroupProjectMembershipsSchema>, TImmutableDBKeys>>;

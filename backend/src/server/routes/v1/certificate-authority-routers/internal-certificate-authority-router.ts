import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import {
  CreateInternalCertificateAuthoritySchema,
  InternalCertificateAuthoritySchema,
  UpdateInternalCertificateAuthoritySchema
} from "@app/services/certificate-authority/internal/internal-certificate-authority-schemas";

import { registerCertificateAuthorityEndpoints } from "./certificate-authority-endpoints";

export const registerInternalCertificateAuthorityRouter = async (server: FastifyZodProvider) => {
  registerCertificateAuthorityEndpoints({
    caType: CaType.INTERNAL,
    server,
    responseSchema: InternalCertificateAuthoritySchema,
    createSchema: CreateInternalCertificateAuthoritySchema,
    updateSchema: UpdateInternalCertificateAuthoritySchema
  });
};

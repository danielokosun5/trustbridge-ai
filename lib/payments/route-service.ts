import { getAgreementRepository } from "@/lib/agreements/repository";
import { createPayPalClient } from "./paypal-client";
import { createPaymentService } from "./service";

export async function getPaymentService() {
  return createPaymentService({
    repository: await getAgreementRepository(),
    paypal: createPayPalClient(),
  });
}

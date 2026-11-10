export const PAYPAL_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;
export type PayPalCurrency = typeof PAYPAL_CURRENCIES[number];

export type PayPalCapture = {
  id: string;
  status: string;
  amount: { value: string; currency_code: string };
};

export type PayPalOrder = {
  id: string;
  status: string;
  intent?: string;
  links?: Array<{ rel?: string; method?: string; href?: string }>;
  payment_source?: Record<string, unknown>;
  purchase_units?: Array<{
    reference_id?: string;
    custom_id?: string;
    amount?: { value: string; currency_code: string };
    payee?: { merchant_id?: string; email_address?: string };
    payments?: { captures?: PayPalCapture[] };
  }>;
};

export type PayPalClient = {
  createOrder(input: { agreementId: string; title: string; amount: string; currency: PayPalCurrency; requestId: string }): Promise<PayPalOrder>;
  getOrder(orderId: string): Promise<PayPalOrder>;
  captureOrder(orderId: string, requestId: string): Promise<PayPalOrder>;
};

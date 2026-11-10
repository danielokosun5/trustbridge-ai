import type { AgreementContent } from "@/lib/agreements/schema";

export function filterAgreementsByQuery<T extends AgreementContent>(agreements: readonly T[], query: string): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...agreements];

  return agreements.filter((agreement) => {
    const searchableText = [
      agreement.title,
      agreement.serviceDescription,
      agreement.summary,
      agreement.buyerName,
      agreement.sellerName,
      ...agreement.deliverables,
      ...agreement.acceptanceCriteria,
    ].join(" ").toLocaleLowerCase();
    return searchableText.includes(normalizedQuery);
  });
}

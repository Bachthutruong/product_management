// src/ai/flows/suggest-reorder-quantity.ts
'use server';

/**
 * @fileOverview AI 動力庫存再訂購數量建議流程。
 *
 * - suggestReorderQuantity - 一個建議產品最佳再訂購數量的函數。
 * - SuggestReorderQuantityInput - suggestReorderQuantity 函數的輸入類型。
 * - SuggestReorderQuantityOutput - suggestReorderQuantity 函數的回傳類型。
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestReorderQuantityInputSchema = z.object({
  productId: z.string().describe('要再訂購的產品 ID。'),
  productName: z.string().describe('產品名稱。'),
  averageDailySales: z.number().describe('產品的平均日銷售量。'),
  currentStockLevel: z.number().describe('產品目前的庫存水平。'),
  leadTimeInDays: z.number().describe('收到新貨所需的提前期（天）。'),
  desiredSafetyStockLevel: z.number().describe('產品所需的目標安全庫存水平。'),
});
export type SuggestReorderQuantityInput = z.infer<typeof SuggestReorderQuantityInputSchema>;

const SuggestReorderQuantityOutputSchema = z.object({
  reorderQuantity: z.number().describe('建議的產品再訂購數量。'),
  reasoning: z.string().describe('建議再訂購數量的理由。'),
});
export type SuggestReorderQuantityOutput = z.infer<typeof SuggestReorderQuantityOutputSchema>;

export async function suggestReorderQuantity(input: SuggestReorderQuantityInput): Promise<SuggestReorderQuantityOutput> {
  return suggestReorderQuantityFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestReorderQuantityPrompt',
  input: {schema: SuggestReorderQuantityInputSchema},
  output: {schema: SuggestReorderQuantityOutputSchema},
  prompt: `您是庫存管理專家。根據以下資訊，建議產品的最佳再訂購數量。

產品 ID: {{{productId}}}
產品名稱: {{{productName}}}
平均日銷售量: {{{averageDailySales}}}
目前庫存水平: {{{currentStockLevel}}}
提前期（天）: {{{leadTimeInDays}}}
目標安全庫存水平: {{{desiredSafetyStockLevel}}}

請考慮提前期、平均日銷售量和目標安全庫存水平，以最大程度地減少庫存不足和過度庫存。提供您建議的再訂購數量的明確理由。
`,
});

const suggestReorderQuantityFlow = ai.defineFlow(
  {
    name: 'suggestReorderQuantityFlow',
    inputSchema: SuggestReorderQuantityInputSchema,
    outputSchema: SuggestReorderQuantityOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

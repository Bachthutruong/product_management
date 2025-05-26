// src/ai/flows/suggest-reorder-quantity.ts
'use server';

/**
 * @fileOverview AI-powered reorder quantity suggestion flow.
 *
 * - suggestReorderQuantity - A function that suggests the optimal reorder quantity for a product.
 * - SuggestReorderQuantityInput - The input type for the suggestReorderQuantity function.
 * - SuggestReorderQuantityOutput - The return type for the suggestReorderQuantity function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestReorderQuantityInputSchema = z.object({
  productId: z.string().describe('The ID of the product to reorder.'),
  productName: z.string().describe('The name of the product.'),
  averageDailySales: z.number().describe('The average daily sales of the product.'),
  currentStockLevel: z.number().describe('The current stock level of the product.'),
  leadTimeInDays: z.number().describe('The lead time in days to receive a new shipment of the product.'),
  desiredSafetyStockLevel: z.number().describe('The desired safety stock level for the product.'),
});
export type SuggestReorderQuantityInput = z.infer<typeof SuggestReorderQuantityInputSchema>;

const SuggestReorderQuantityOutputSchema = z.object({
  reorderQuantity: z.number().describe('The suggested reorder quantity for the product.'),
  reasoning: z.string().describe('The reasoning behind the suggested reorder quantity.'),
});
export type SuggestReorderQuantityOutput = z.infer<typeof SuggestReorderQuantityOutputSchema>;

export async function suggestReorderQuantity(input: SuggestReorderQuantityInput): Promise<SuggestReorderQuantityOutput> {
  return suggestReorderQuantityFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestReorderQuantityPrompt',
  input: {schema: SuggestReorderQuantityInputSchema},
  output: {schema: SuggestReorderQuantityOutputSchema},
  prompt: `You are an expert inventory management specialist. Based on the following information, suggest an optimal reorder quantity for the product.

Product ID: {{{productId}}}
Product Name: {{{productName}}}
Average Daily Sales: {{{averageDailySales}}}
Current Stock Level: {{{currentStockLevel}}}
Lead Time (days): {{{leadTimeInDays}}}
Desired Safety Stock Level: {{{desiredSafetyStockLevel}}}

Consider the lead time, average daily sales, and desired safety stock level to minimize stockouts and overstocking. Provide a clear reasoning for your suggested reorder quantity.
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

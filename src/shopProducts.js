// src/shopProducts.js
// Shared definitions for store products and rewards.

export const PRODUCT_IDS = {
  COINS_250: "com.wildmoustachegames.flagiq.coins.250",
  COINS_600: "com.wildmoustachegames.flagiq.coins.600",
  COINS_1500: "com.wildmoustachegames.flagiq.coins.1500",
  COINS_5000: "com.wildmoustachegames.flagiq.coins.5000",
  HEARTS_REFILL: "com.wildmoustachegames.flagiq.heart.refill",
};

export const SHOP_PRODUCTS = [
  {
    id: PRODUCT_IDS.COINS_250,
    type: "coins",
    label: "250 coins",
    priceLabel: "€0.99",
    reward: { coins: 250 },
  },
  {
    id: PRODUCT_IDS.COINS_600,
    type: "coins",
    label: "600 coins",
    priceLabel: "€1.99",
    reward: { coins: 600 },
  },
  {
    id: PRODUCT_IDS.COINS_1500,
    type: "coins",
    label: "1,500 coins",
    priceLabel: "€3.99",
    reward: { coins: 1500 },
  },
  {
    id: PRODUCT_IDS.COINS_5000,
    type: "coins",
    label: "5,000 coins",
    priceLabel: "€9.99",
    reward: { coins: 5000 },
  },
  {
    id: PRODUCT_IDS.HEARTS_REFILL,
    type: "hearts",
    label: "Refill hearts",
    priceLabel: "€0.99",
    reward: { heartsRefill: true },
  },
];

export function getProductDefinition(productId) {
  return SHOP_PRODUCTS.find((p) => p.id === productId);
}

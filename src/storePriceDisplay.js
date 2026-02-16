export const STORE_PRICE_PLACEHOLDER = "…";

function hasStoreKitLocalizedPrice(storeProduct) {
  return typeof storeProduct?.localizedPriceString === "string" &&
    storeProduct.localizedPriceString.trim().length > 0;
}

export function getStoreUiPriceData(storeProduct) {
  if (hasStoreKitLocalizedPrice(storeProduct)) {
    return {
      uiDisplayedPrice: storeProduct.localizedPriceString,
      uiPriceSource: "storekit",
      hasStoreKitProduct: true,
    };
  }

  return {
    uiDisplayedPrice: STORE_PRICE_PLACEHOLDER,
    uiPriceSource: "placeholder",
    hasStoreKitProduct: false,
  };
}

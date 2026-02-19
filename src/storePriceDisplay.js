export const STORE_PRICE_PLACEHOLDER = "…";

function hasStoreKitLocalizedPrice(storeProduct) {
  return (
    typeof storeProduct?.localizedPriceString === "string" &&
    storeProduct.localizedPriceString.trim().length > 0
  );
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

export function getProductCurrencyDiagnostics(productId, storeProduct) {
  const uiPrice = getStoreUiPriceData(storeProduct);
  return {
    productId,
    storekitLocalizedPriceString: storeProduct?.localizedPriceString || null,
    storekitCurrencyCode: storeProduct?.currencyCode || null,
    storekitPriceLocaleIdentifier:
      storeProduct?.priceLocaleIdentifier ||
      storeProduct?.priceLocale?.identifier ||
      null,
    uiDisplayedPrice: uiPrice.uiDisplayedPrice,
    uiPriceSource: uiPrice.uiPriceSource,
  };
}

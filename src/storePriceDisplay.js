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
      uiPriceSourceReason: "Using StoreKit localizedPriceString for this productId.",
      hasStoreKitProduct: true,
    };
  }

  return {
    uiDisplayedPrice: STORE_PRICE_PLACEHOLDER,
    uiPriceSource: "placeholder",
    uiPriceSourceReason:
      "Store product missing or localizedPriceString unavailable; purchase CTA locked until StoreKit product is loaded.",
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
    storefrontCountryCode: storeProduct?.storefrontCountryCode || null,
    storefrontCountryCodeNote: storeProduct?.storefrontCountryCodeNote || null,
    uiDisplayedPrice: uiPrice.uiDisplayedPrice,
    uiPriceSource: uiPrice.uiPriceSource,
    uiPriceSourceReason: uiPrice.uiPriceSourceReason,
  };
}

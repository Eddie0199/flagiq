#import <Capacitor/Capacitor.h>

CAP_PLUGIN(StoreKitPurchasePlugin, "StoreKitPurchase",
    CAP_PLUGIN_METHOD(fetchProducts, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(purchase, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(echo, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(iapCanMakePayments, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(iapDiagnosticsGetState, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(iapDiagnosticsClear, CAPPluginReturnPromise);
)

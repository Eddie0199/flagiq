import Capacitor
import StoreKit

@objc(StoreKitPurchasePlugin)
public class StoreKitPurchasePlugin: CAPPlugin, SKProductsRequestDelegate, SKPaymentTransactionObserver {
    private var pendingCall: CAPPluginCall?
    private var purchaseRequest: SKProductsRequest?
    private var fetchProductsCall: CAPPluginCall?
    private var fetchProductsRequest: SKProductsRequest?
    private var pendingProductId: String?
    private let diagnosticsMaxEvents = 50
    private var diagnosticsRequestedProductIds: [String] = []
    private var diagnosticsProducts: [[String: Any]] = []
    private var diagnosticsInvalidProductIdentifiers: [String] = []
    private var diagnosticsLastPurchaseAttempt: [String: Any] = [:]
    private var diagnosticsNativeEvents: [[String: Any]] = []

    public override func load() {
        SKPaymentQueue.default().add(self)
        CAPLog.print("[IAP] StoreKitPurchase plugin loaded")
    }

    deinit {
        SKPaymentQueue.default().remove(self)
    }

    @objc func fetchProducts(_ call: CAPPluginCall) {
        guard fetchProductsCall == nil else {
            call.reject("Product request already in progress")
            return
        }

        let productIds = call.getArray("productIds", String.self) ?? []
        if productIds.isEmpty {
            call.reject("Missing productIds")
            return
        }

        diagnosticsRequestedProductIds = productIds
        CAPLog.print("[IAP] product fetch start: \(productIds)")
        appendNativeEvent([
            "event": "fetchProducts:start",
            "requestedProductIds": productIds
        ])
        fetchProductsCall = call
        fetchProductsRequest?.cancel()

        let request = SKProductsRequest(productIdentifiers: Set(productIds))
        fetchProductsRequest = request
        request.delegate = self
        request.start()
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard pendingCall == nil else {
            call.reject("Purchase already in progress")
            return
        }

        guard let productId = call.getString("productId"), !productId.isEmpty else {
            call.reject("Missing productId")
            return
        }

        guard SKPaymentQueue.canMakePayments() else {
            let payload: [String: Any] = [
                "success": false,
                "error": "In-app purchases are disabled",
                "canMakePayments": false
            ]
            diagnosticsLastPurchaseAttempt = payload
            appendNativeEvent([
                "event": "purchase:blocked",
                "productId": productId,
                "canMakePayments": false
            ])
            call.resolve(payload)
            return
        }

        CAPLog.print("[IAP] purchase start productId=\(productId)")
        appendNativeEvent([
            "event": "purchase:start",
            "productId": productId
        ])
        pendingCall = call
        pendingProductId = productId

        purchaseRequest?.cancel()
        let request = SKProductsRequest(productIdentifiers: [productId])
        purchaseRequest = request
        request.delegate = self
        request.start()
    }

    public func productsRequest(_ request: SKProductsRequest, didReceive response: SKProductsResponse) {
        if request === purchaseRequest {
            handlePurchaseProductsResponse(response)
            return
        }

        if request === fetchProductsRequest {
            handleFetchProductsResponse(response)
        }
    }

    public func request(_ request: SKRequest, didFailWithError error: Error) {
        let nsError = error as NSError
        CAPLog.print("[IAP] request failed code=\(nsError.code) message=\(nsError.localizedDescription)")
        appendNativeEvent([
            "event": "request:failed",
            "error": buildErrorPayload(nsError)
        ])

        if let purchaseRequest = purchaseRequest, request === purchaseRequest {
            let call = pendingCall
            resetPendingPurchase()
            let payload: [String: Any] = [
                "success": false,
                "error": nsError.localizedDescription,
                "errorDomain": nsError.domain,
                "errorCode": nsError.code,
                "errorLocalizedDescription": nsError.localizedDescription,
                "errorUserInfo": serializeUserInfo(nsError.userInfo)
            ]
            diagnosticsLastPurchaseAttempt = payload
            call?.resolve(payload)
            return
        }

        if let fetchProductsRequest = fetchProductsRequest, request === fetchProductsRequest {
            let call = fetchProductsCall
            resetPendingFetch()
            let payload: [String: Any] = [
                "success": false,
                "error": nsError.localizedDescription,
                "errorDomain": nsError.domain,
                "errorCode": nsError.code,
                "errorLocalizedDescription": nsError.localizedDescription,
                "errorUserInfo": serializeUserInfo(nsError.userInfo),
                "products": [],
                "invalidProductIds": []
            ]
            call?.resolve(payload)
        }
    }

    public func paymentQueue(_ queue: SKPaymentQueue, updatedTransactions transactions: [SKPaymentTransaction]) {
        guard let call = pendingCall else { return }
        guard let productId = pendingProductId else { return }

        for transaction in transactions where transaction.payment.productIdentifier == productId {
            CAPLog.print("[IAP] transaction update productId=\(productId) state=\(transaction.transactionState.rawValue)")
            appendTransactionEvent(transaction, event: "transaction:update")
            switch transaction.transactionState {
            case .purchased:
                let transactionId = transaction.transactionIdentifier ?? ""
                CAPLog.print("[IAP] purchase completion productId=\(productId) transactionId=\(transactionId)")
                CAPLog.print("[IAP] transaction finish start productId=\(productId) state=purchased")
                appendNativeEvent([
                    "event": "transaction:finish:start",
                    "productId": productId,
                    "state": "purchased"
                ])
                SKPaymentQueue.default().finishTransaction(transaction)
                appendNativeEvent([
                    "event": "transaction:finish:complete",
                    "productId": productId,
                    "state": "purchased"
                ])
                CAPLog.print("[IAP] transaction finish complete productId=\(productId) state=purchased")
                resetPendingPurchase()
                let payload: [String: Any] = [
                    "success": true,
                    "transactionId": transactionId
                ]
                diagnosticsLastPurchaseAttempt = payload
                call.resolve(payload)
            case .failed:
                let error = transaction.error as NSError?
                CAPLog.print("[IAP] purchase failure productId=\(productId) errorCode=\(error?.code ?? -1) message=\(transaction.error?.localizedDescription ?? "Purchase failed")")
                CAPLog.print("[IAP] transaction finish start productId=\(productId) state=failed")
                appendNativeEvent([
                    "event": "transaction:finish:start",
                    "productId": productId,
                    "state": "failed"
                ])
                SKPaymentQueue.default().finishTransaction(transaction)
                appendNativeEvent([
                    "event": "transaction:finish:complete",
                    "productId": productId,
                    "state": "failed"
                ])
                CAPLog.print("[IAP] transaction finish complete productId=\(productId) state=failed")
                resetPendingPurchase()
                if let error = error, error.code == SKError.paymentCancelled.rawValue {
                    let payload: [String: Any] = [
                        "success": false,
                        "cancelled": true,
                        "errorCode": error.code,
                        "errorDomain": error.domain,
                        "errorLocalizedDescription": error.localizedDescription,
                        "errorUserInfo": serializeUserInfo(error.userInfo)
                    ]
                    diagnosticsLastPurchaseAttempt = payload
                    call.resolve(payload)
                } else {
                    let payload: [String: Any] = [
                        "success": false,
                        "error": transaction.error?.localizedDescription ?? "Purchase failed",
                        "errorDomain": error?.domain ?? "unknown",
                        "errorCode": error?.code ?? -1,
                        "errorLocalizedDescription": error?.localizedDescription ?? "Purchase failed",
                        "errorUserInfo": serializeUserInfo(error?.userInfo ?? [:])
                    ]
                    diagnosticsLastPurchaseAttempt = payload
                    call.resolve(payload)
                }
            case .restored:
                CAPLog.print("[IAP] transaction finish start productId=\(productId) state=restored")
                appendNativeEvent([
                    "event": "transaction:finish:start",
                    "productId": productId,
                    "state": "restored"
                ])
                SKPaymentQueue.default().finishTransaction(transaction)
                appendNativeEvent([
                    "event": "transaction:finish:complete",
                    "productId": productId,
                    "state": "restored"
                ])
                CAPLog.print("[IAP] transaction finish complete productId=\(productId) state=restored")
            case .purchasing, .deferred:
                break
            @unknown default:
                break
            }
        }
    }

    private func handlePurchaseProductsResponse(_ response: SKProductsResponse) {
        guard let call = pendingCall else { return }

        CAPLog.print("[IAP] product fetch response for purchase valid=\(response.products.map { $0.productIdentifier }) invalid=\(response.invalidProductIdentifiers)")

        diagnosticsProducts = response.products.map { mapProduct($0) }
        diagnosticsInvalidProductIdentifiers = response.invalidProductIdentifiers
        guard let product = response.products.first else {
            resetPendingPurchase()
            let payload: [String: Any] = [
                "success": false,
                "error": "Product not found",
                "errorDomain": "StoreKitPurchase",
                "errorCode": -2,
                "errorLocalizedDescription": "Product not found",
                "invalidProductIds": response.invalidProductIdentifiers
            ]
            diagnosticsLastPurchaseAttempt = payload
            call.resolve(payload)
            return
        }

        let payment = SKPayment(product: product)
        SKPaymentQueue.default().add(payment)
    }

    private func handleFetchProductsResponse(_ response: SKProductsResponse) {
        guard let call = fetchProductsCall else { return }

        let products = response.products.map { mapProduct($0) }
        diagnosticsProducts = products
        diagnosticsInvalidProductIdentifiers = response.invalidProductIdentifiers

        CAPLog.print("[IAP] product fetch response valid=\(response.products.map { $0.productIdentifier }) invalid=\(response.invalidProductIdentifiers)")
        resetPendingFetch()
        call.resolve([
            "success": true,
            "products": products,
            "invalidProductIds": response.invalidProductIdentifiers
        ])
    }

    @objc func iapCanMakePayments(_ call: CAPPluginCall) {
        call.resolve(["canMakePayments": SKPaymentQueue.canMakePayments()])
    }

    @objc func iapDiagnosticsGetState(_ call: CAPPluginCall) {
        call.resolve([
            "canMakePayments": SKPaymentQueue.canMakePayments(),
            "requestedProductIds": diagnosticsRequestedProductIds,
            "products": diagnosticsProducts,
            "invalidProductIdentifiers": diagnosticsInvalidProductIdentifiers,
            "lastPurchaseAttempt": diagnosticsLastPurchaseAttempt,
            "nativeEvents": diagnosticsNativeEvents
        ])
    }

    @objc func iapDiagnosticsClear(_ call: CAPPluginCall) {
        diagnosticsRequestedProductIds = []
        diagnosticsProducts = []
        diagnosticsInvalidProductIdentifiers = []
        diagnosticsLastPurchaseAttempt = [:]
        diagnosticsNativeEvents = []
        call.resolve(["cleared": true])
    }

    private func format(price: NSDecimalNumber, locale: Locale) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = locale
        return formatter.string(from: price) ?? "\(price)"
    }

    private func mapProduct(_ product: SKProduct) -> [String: Any] {
        [
            "productId": product.productIdentifier,
            "title": product.localizedTitle,
            "description": product.localizedDescription,
            "price": product.price.stringValue,
            "localizedPrice": format(price: product.price, locale: product.priceLocale),
            "priceLocale": [
                "identifier": product.priceLocale.identifier,
                "currencyCode": product.priceLocale.currencyCode ?? "",
                "currencySymbol": product.priceLocale.currencySymbol ?? ""
            ]
        ]
    }

    private func appendTransactionEvent(_ transaction: SKPaymentTransaction, event: String) {
        appendNativeEvent([
            "event": event,
            "productId": transaction.payment.productIdentifier,
            "state": transactionStateLabel(transaction.transactionState)
        ])
    }

    private func appendNativeEvent(_ payload: [String: Any]) {
        var enriched = payload
        enriched["timestamp"] = ISO8601DateFormatter().string(from: Date())
        diagnosticsNativeEvents.insert(enriched, at: 0)
        if diagnosticsNativeEvents.count > diagnosticsMaxEvents {
            diagnosticsNativeEvents = Array(diagnosticsNativeEvents.prefix(diagnosticsMaxEvents))
        }
    }

    private func transactionStateLabel(_ state: SKPaymentTransactionState) -> String {
        switch state {
        case .purchasing: return "purchasing"
        case .purchased: return "purchased"
        case .failed: return "failed"
        case .restored: return "restored"
        case .deferred: return "deferred"
        @unknown default: return "unknown"
        }
    }

    private func buildErrorPayload(_ error: NSError) -> [String: Any] {
        [
            "errorDomain": error.domain,
            "errorCode": error.code,
            "errorLocalizedDescription": error.localizedDescription,
            "errorUserInfo": serializeUserInfo(error.userInfo)
        ]
    }

    private func serializeUserInfo(_ userInfo: [String: Any]) -> [String: String] {
        var serialized: [String: String] = [:]
        for (key, value) in userInfo {
            serialized[key] = String(describing: value)
        }
        return serialized
    }

    private func resetPendingPurchase() {
        pendingCall = nil
        pendingProductId = nil
        purchaseRequest = nil
    }

    private func resetPendingFetch() {
        fetchProductsCall = nil
        fetchProductsRequest = nil
    }
}

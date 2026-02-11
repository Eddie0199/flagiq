import Capacitor
import StoreKit

@objc(StoreKitPurchase)
public class StoreKitPurchasePlugin: CAPPlugin, SKProductsRequestDelegate, SKPaymentTransactionObserver {
    private var pendingCall: CAPPluginCall?
    private var purchaseRequest: SKProductsRequest?
    private var fetchProductsCall: CAPPluginCall?
    private var fetchProductsRequest: SKProductsRequest?
    private var pendingProductId: String?

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

        CAPLog.print("[IAP] product fetch start: \(productIds)")
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
            call.reject("In-app purchases are disabled")
            return
        }

        CAPLog.print("[IAP] purchase start productId=\(productId)")
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

        if let purchaseRequest = purchaseRequest, request === purchaseRequest {
            let call = pendingCall
            resetPendingPurchase()
            call?.resolve([
                "success": false,
                "errorCode": nsError.code,
                "error": nsError.localizedDescription
            ])
            return
        }

        if let fetchProductsRequest = fetchProductsRequest, request === fetchProductsRequest {
            let call = fetchProductsCall
            resetPendingFetch()
            call?.resolve([
                "success": false,
                "error": nsError.localizedDescription,
                "products": [],
                "invalidProductIds": []
            ])
        }
    }

    public func paymentQueue(_ queue: SKPaymentQueue, updatedTransactions transactions: [SKPaymentTransaction]) {
        guard let call = pendingCall else { return }
        guard let productId = pendingProductId else { return }

        for transaction in transactions where transaction.payment.productIdentifier == productId {
            CAPLog.print("[IAP] transaction update productId=\(productId) state=\(transaction.transactionState.rawValue)")
            switch transaction.transactionState {
            case .purchased:
                let transactionId = transaction.transactionIdentifier ?? ""
                CAPLog.print("[IAP] purchase completion productId=\(productId) transactionId=\(transactionId)")
                CAPLog.print("[IAP] transaction finish start productId=\(productId) state=purchased")
                SKPaymentQueue.default().finishTransaction(transaction)
                CAPLog.print("[IAP] transaction finish complete productId=\(productId) state=purchased")
                resetPendingPurchase()
                call.resolve([
                    "success": true,
                    "transactionId": transactionId
                ])
            case .failed:
                let error = transaction.error as NSError?
                CAPLog.print("[IAP] purchase failure productId=\(productId) errorCode=\(error?.code ?? -1) message=\(transaction.error?.localizedDescription ?? "Purchase failed")")
                CAPLog.print("[IAP] transaction finish start productId=\(productId) state=failed")
                SKPaymentQueue.default().finishTransaction(transaction)
                CAPLog.print("[IAP] transaction finish complete productId=\(productId) state=failed")
                resetPendingPurchase()
                if let error = error, error.code == SKError.paymentCancelled.rawValue {
                    call.resolve([
                        "success": false,
                        "cancelled": true,
                        "errorCode": error.code
                    ])
                } else {
                    call.resolve([
                        "success": false,
                        "errorCode": error?.code ?? -1,
                        "error": transaction.error?.localizedDescription ?? "Purchase failed"
                    ])
                }
            case .restored:
                CAPLog.print("[IAP] transaction finish start productId=\(productId) state=restored")
                SKPaymentQueue.default().finishTransaction(transaction)
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

        guard let product = response.products.first else {
            resetPendingPurchase()
            call.resolve([
                "success": false,
                "error": "Product not found",
                "invalidProductIds": response.invalidProductIdentifiers
            ])
            return
        }

        let payment = SKPayment(product: product)
        SKPaymentQueue.default().add(payment)
    }

    private func handleFetchProductsResponse(_ response: SKProductsResponse) {
        guard let call = fetchProductsCall else { return }

        let products = response.products.map { product in
            [
                "productId": product.productIdentifier,
                "title": product.localizedTitle,
                "description": product.localizedDescription,
                "price": product.price.stringValue,
                "localizedPrice": format(price: product.price, locale: product.priceLocale)
            ]
        }

        CAPLog.print("[IAP] product fetch response valid=\(response.products.map { $0.productIdentifier }) invalid=\(response.invalidProductIdentifiers)")
        resetPendingFetch()
        call.resolve([
            "success": true,
            "products": products,
            "invalidProductIds": response.invalidProductIdentifiers
        ])
    }

    private func format(price: NSDecimalNumber, locale: Locale) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = locale
        return formatter.string(from: price) ?? "\(price)"
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

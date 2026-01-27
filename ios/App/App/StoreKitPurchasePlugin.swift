import Capacitor
import StoreKit

@objc(StoreKitPurchase)
public class StoreKitPurchasePlugin: CAPPlugin, SKProductsRequestDelegate, SKPaymentTransactionObserver {
    private var pendingCall: CAPPluginCall?
    private var productsRequest: SKProductsRequest?
    private var pendingProductId: String?

    public override func load() {
        SKPaymentQueue.default().add(self)
    }

    deinit {
        SKPaymentQueue.default().remove(self)
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

        pendingCall = call
        pendingProductId = productId

        productsRequest?.cancel()
        let request = SKProductsRequest(productIdentifiers: [productId])
        productsRequest = request
        request.delegate = self
        request.start()
    }

    public func productsRequest(_ request: SKProductsRequest, didReceive response: SKProductsResponse) {
        guard let call = pendingCall else { return }
        guard let product = response.products.first else {
            resetPending()
            call.reject("Product not found")
            return
        }

        let payment = SKPayment(product: product)
        SKPaymentQueue.default().add(payment)
    }

    public func paymentQueue(_ queue: SKPaymentQueue, updatedTransactions transactions: [SKPaymentTransaction]) {
        guard let call = pendingCall else { return }
        guard let productId = pendingProductId else { return }

        for transaction in transactions where transaction.payment.productIdentifier == productId {
            switch transaction.transactionState {
            case .purchased:
                let transactionId = transaction.transactionIdentifier ?? ""
                SKPaymentQueue.default().finishTransaction(transaction)
                resetPending()
                call.resolve([
                    "success": true,
                    "transactionId": transactionId
                ])
            case .failed:
                let error = transaction.error as NSError?
                SKPaymentQueue.default().finishTransaction(transaction)
                resetPending()
                if let error = error, error.code == SKError.paymentCancelled.rawValue {
                    call.resolve([
                        "success": false,
                        "cancelled": true
                    ])
                } else {
                    call.resolve([
                        "success": false,
                        "error": transaction.error?.localizedDescription ?? "Purchase failed"
                    ])
                }
            case .restored:
                SKPaymentQueue.default().finishTransaction(transaction)
            case .purchasing, .deferred:
                break
            @unknown default:
                break
            }
        }
    }

    private func resetPending() {
        pendingCall = nil
        pendingProductId = nil
        productsRequest = nil
    }
}

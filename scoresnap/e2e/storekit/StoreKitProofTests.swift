// Tier 2 StoreKit proof (cut 2026-11-03-e2e-tiered-cost.md). Local StoreKit only (SKTestSession + SnapScore.storekit):
// proves the config loads under `xcodebuild test` in a prebuilt Expo app. It is NOT server eligibility, NOT a live
// sandbox price and NOT RevenueCat offerings; those stay separate (Tier 3 / later steps).
import StoreKit
import StoreKitTest
import XCTest

@available(iOS 17.0, *)
final class StoreKitProofTests: XCTestCase {
    static let ids = ["snapscore.td.annual", "snapscore.td.monthly"]
    static let prices: [String: String] = ["snapscore.td.annual": "79.99", "snapscore.td.monthly": "12.99"]
    var session: SKTestSession!

    override func setUpWithError() throws {
        session = try SKTestSession(configurationFileNamed: "SnapScore")
        session.resetToDefaultState()
        session.disableDialogs = true
        session.clearTransactions()
    }

    override func tearDown() {
        session?.clearTransactions()
        super.tearDown()
    }

    func testTwoShippingProductsLoadWithCatalogPrices() async throws {
        let products = try await Product.products(for: Self.ids)
        XCTAssertEqual(Set(products.map(\.id)), Set(Self.ids))
        for p in products {
            XCTAssertEqual(p.type, .autoRenewable, p.id)
            XCTAssertEqual(p.price, Decimal(string: Self.prices[p.id]!), p.id)
            XCTAssertFalse(p.displayPrice.isEmpty, p.id)
            print("STOREKIT_PROOF product=\(p.id) displayPrice=\(p.displayPrice)")
        }
        XCTAssertEqual(Set(products.compactMap { $0.subscription?.subscriptionGroupID }).count, 1, "one subscription group")
    }

    // Owner t1517u (Nov 18 2026): Tournament Director has no free trial. No shipping product may carry an intro offer.
    func testNoShippingProductHasAnIntroductoryOffer() async throws {
        for p in try await Product.products(for: Self.ids) {
            XCTAssertNil(p.subscription?.introductoryOffer, p.id)
        }
    }

    // The first TD annual purchase is a plain paid purchase: no introductory/free-trial offer type.
    func testFirstTDAnnualPurchaseIsNotATrial() async throws {
        let loaded = try await Product.products(for: ["snapscore.td.annual"])
        let annual = try XCTUnwrap(loaded.first)
        let result = try await annual.purchase()
        guard case .success(let verification) = result, case .verified(let txn) = verification else {
            return XCTFail("purchase did not return a verified transaction: \(result)")
        }
        XCTAssertEqual(txn.productID, "snapscore.td.annual")
        XCTAssertNil(txn.offerType, "TD annual must be a plain paid purchase, not an introductory offer")
        await txn.finish()
        print("STOREKIT_PROOF td annual offerType=\(String(describing: txn.offerType))")
    }

    func testRestoreUsesTDAnnualEntitlement() async throws {
        let products = try await Product.products(for: ["snapscore.td.annual"])
        let annual = try XCTUnwrap(products.first)
        let result = try await annual.purchase()
        guard case .success(let verification) = result, case .verified(let transaction) = verification else {
            return XCTFail("TD annual purchase did not return a verified transaction: \(result)")
        }
        XCTAssertEqual(transaction.productID, "snapscore.td.annual")
        await transaction.finish()

        try await AppStore.sync()
        var restored = Set<String>()
        for await entitlement in Transaction.currentEntitlements {
            guard case .verified(let transaction) = entitlement else { continue }
            restored.insert(transaction.productID)
        }
        XCTAssertTrue(restored.contains("snapscore.td.annual"), "restore must retain the TD annual entitlement")
        XCTAssertFalse(restored.contains("snapscore.pro.annual"), "the flag-off fixture must not restore a Pro product")
    }

    // Unknown IDs return nothing (no phantom product).
    func testUnknownProductIdReturnsNoProduct() async throws {
        let products = try await Product.products(for: ["snapscore.pro.lifetime.notreal"])
        XCTAssertTrue(products.isEmpty)
    }
}

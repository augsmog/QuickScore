// Tier 2 StoreKit proof (cut 2026-11-03-e2e-tiered-cost.md). Local StoreKit only (SKTestSession + SnapScore.storekit):
// proves the config loads under `xcodebuild test` in a prebuilt Expo app. It is NOT server eligibility, NOT a live
// sandbox price and NOT RevenueCat offerings; those stay separate (Tier 3 / later steps).
import StoreKit
import StoreKitTest
import XCTest

@available(iOS 17.0, *)
final class StoreKitProofTests: XCTestCase {
    static let ids = ["snapscore.pro.annual", "snapscore.pro.monthly", "snapscore.td.annual", "snapscore.td.monthly"]
    static let prices: [String: String] = ["snapscore.pro.annual": "24.99", "snapscore.pro.monthly": "3.99",
                                           "snapscore.td.annual": "79.99", "snapscore.td.monthly": "12.99"]
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

    func testFourProductsLoadWithCatalogPrices() async throws {
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

    func testAnnualsHaveSevenDayFreeTrialMonthliesNone() async throws {
        for p in try await Product.products(for: Self.ids) {
            let intro = p.subscription?.introductoryOffer
            if p.id.hasSuffix(".annual") {
                XCTAssertEqual(intro?.paymentMode, .freeTrial, p.id)
                XCTAssertEqual(intro?.period.unit, .week, p.id)
                XCTAssertEqual(intro?.period.value, 1, p.id)
            } else {
                XCTAssertNil(intro, p.id)
            }
        }
    }

    // Deterministic eligible -> ineligible -> eligible fixture (identity switch analogue: clearing history).
    func testTrialEligibilityFlipsAfterPurchaseAndResetsOnClear() async throws {
        let loaded = try await Product.products(for: ["snapscore.pro.annual"])
        let annual = try XCTUnwrap(loaded.first)
        let group = try XCTUnwrap(annual.subscription?.subscriptionGroupID)
        let before = await Product.SubscriptionInfo.isEligibleForIntroOffer(for: group)
        XCTAssertTrue(before, "fresh history is trial-eligible")
        _ = try await session.buyProduct(identifier: "snapscore.pro.annual")
        let after = await Product.SubscriptionInfo.isEligibleForIntroOffer(for: group)
        XCTAssertFalse(after, "after a subscription in the group, no second trial")
        session.clearTransactions()
        let cleared = await Product.SubscriptionInfo.isEligibleForIntroOffer(for: group)
        XCTAssertTrue(cleared, "cleared history must not reuse stale ineligibility")
        print("STOREKIT_PROOF eligibility before=\(before) after=\(after) cleared=\(cleared)")
    }

    // Unknown IDs return nothing (no phantom product, so no phantom trial promise).
    func testUnknownProductIdReturnsNoProduct() async throws {
        let products = try await Product.products(for: ["snapscore.pro.lifetime.notreal"])
        XCTAssertTrue(products.isEmpty)
    }
}

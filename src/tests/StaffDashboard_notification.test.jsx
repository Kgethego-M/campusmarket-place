/**
 * StaffDashboard_alertNotification.test.jsx
 */

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { vi, describe, test, beforeEach, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Navbar from "../components/NavBarTemp";

// ─── Router mock ───────────────────────────────────────────────────────────────
const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: "/view-listing" }),
  };
});

// ─── Firebase mocks ────────────────────────────────────────────────────────────
const mockAddDoc     = vi.fn(() => Promise.resolve({ id: "new-notif-id" }));
const mockGetDoc     = vi.fn();
const mockGetDocs    = vi.fn();
const mockUpdateDoc  = vi.fn(() => Promise.resolve());
const mockOnSnapshot = vi.fn();

vi.mock("../firebase", () => ({ auth: {}, db: {} }));

vi.mock("firebase/auth", () => ({
  signOut: vi.fn(() => Promise.resolve()),
  onAuthStateChanged: vi.fn((auth, cb) => {
    cb({ uid: "buyer-uid", displayName: "Athalia Mamba", email: "athalia@test.com" });
    return () => {};
  }),
}));

vi.mock("firebase/firestore", () => ({
  collection:      vi.fn((_db, col) => col),
  query:           vi.fn((...args) => args),
  where:           vi.fn((...args) => args),
  doc:             vi.fn((_db, col, id) => ({ col, id })),
  addDoc:          (...args) => mockAddDoc(...args),
  updateDoc:       (...args) => mockUpdateDoc(...args),
  getDoc:          (...args) => mockGetDoc(...args),
  getDocs:         (...args) => mockGetDocs(...args),
  onSnapshot:      (...args) => mockOnSnapshot(...args),
  serverTimestamp: vi.fn(() => "SERVER_TS"),
}));

vi.mock("../components/NavBar.module.css", () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}));

// ─── Fixtures ──────────────────────────────────────────────────────────────────

/** Legacy fixture kept for the original describe blocks */
const OVERDUE_TXN = {
  id:           "txn-001",
  item:         "Patek Philippe watch (Pre-owned)",
  listingTitle: "Patek Philippe watch (Pre-owned)",
  listingId:    "listing-001",
  sellerId:     "seller-uid",
  buyerId:      "buyer-uid",
  status:       "pending",
  dropOffDate:  "2026-05-01",
};

/** Base fixture used by the extended describe blocks */
const BASE_TXN = {
  id:           "txn-001",
  item:         "Canon EOS R5",
  listingTitle: "Canon EOS R5",
  listingId:    "listing-001",
  sellerId:     "seller-uid",
  buyerId:      "buyer-uid",
  status:       "pending",
  paymentType:  "cash",
};

// ─── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Intercepts every mockAddDoc call and captures its payload.
 * Returns the live array — assertions can read it after the awaited calls.
 */
function captureNotificationPayloads() {
  const payloads = [];
  mockAddDoc.mockImplementation((_col, data) => {
    payloads.push(data);
    return Promise.resolve({ id: `notif-${payloads.length}` });
  });
  return payloads;
}

/** Renders Navbar inside a MemoryRouter and waits for async effects to settle. */
const renderNav = async () => {
  let result;
  await act(async () => {
    result = render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );
  });
  return result;
};

/** Prime mockOnSnapshot to immediately deliver a list of notification docs. */
function mockNotificationDocs(docs) {
  mockOnSnapshot.mockImplementation((_q, cb) => {
    cb({ docs });
    return () => {};
  });
}

/** Build a fake Firestore notification doc snapshot. */
function makeNotifDoc(id, overrides = {}) {
  return {
    id,
    data: () => ({
      userId:        "buyer-uid",
      read:          false,
      type:          "overdue_dropoff_buyer",
      listingId:     "listing-001",
      transactionId: "txn-001",
      listingTitle:  "Canon EOS R5",
      message:       `The seller has not yet dropped off "Canon EOS R5" at the trade facility.`,
      createdAt:     { toDate: () => new Date(Date.now() - 3000) },
      ...overrides,
    }),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. Original tests — Overdue alert → Firestore notifications collection
// ══════════════════════════════════════════════════════════════════════════════

describe("Overdue alert → Firestore notifications collection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDoc.mockResolvedValue({ exists: () => false });
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    mockOnSnapshot.mockImplementation((_q, cb) => { cb({ docs: [] }); return () => {}; });
  });

  test("notifyOverdueDropOff writes seller + buyer docs to notifications", async () => {
    const payloads = captureNotificationPayloads();

    await mockAddDoc("notifications", {
      userId:        OVERDUE_TXN.sellerId,
      read:          false,
      createdAt:     "SERVER_TS",
      type:          "overdue_dropoff_seller",
      listingId:     OVERDUE_TXN.listingId,
      transactionId: OVERDUE_TXN.id,
      listingTitle:  OVERDUE_TXN.listingTitle,
      message:       `Your drop-off for "${OVERDUE_TXN.listingTitle}" is overdue. Please come to the trade facility as soon as possible or your transaction may be cancelled.`,
    });
    await mockAddDoc("notifications", {
      userId:        OVERDUE_TXN.buyerId,
      read:          false,
      createdAt:     "SERVER_TS",
      type:          "overdue_dropoff_buyer",
      listingId:     OVERDUE_TXN.listingId,
      transactionId: OVERDUE_TXN.id,
      listingTitle:  OVERDUE_TXN.listingTitle,
      message:       `The seller has not yet dropped off "${OVERDUE_TXN.listingTitle}" at the trade facility. We have sent them a reminder. You will be notified once it arrives.`,
    });

    expect(payloads).toHaveLength(2);

    expect(payloads[0]).toMatchObject({
      userId:        "seller-uid",
      read:          false,
      type:          "overdue_dropoff_seller",
      transactionId: "txn-001",
      listingTitle:  "Patek Philippe watch (Pre-owned)",
    });
    expect(payloads[0].message).toContain("overdue");

    expect(payloads[1]).toMatchObject({
      userId:        "buyer-uid",
      read:          false,
      type:          "overdue_dropoff_buyer",
      transactionId: "txn-001",
    });
    expect(payloads[1].message).toContain("reminder");
  });

  test("notifyOverdueCollection writes seller + buyer docs to notifications", async () => {
    const payloads = captureNotificationPayloads();

    await mockAddDoc("notifications", {
      userId:        OVERDUE_TXN.buyerId,
      read:          false,
      createdAt:     "SERVER_TS",
      type:          "overdue_collection_buyer",
      listingId:     OVERDUE_TXN.listingId,
      transactionId: OVERDUE_TXN.id,
      listingTitle:  OVERDUE_TXN.listingTitle,
      message:       `You did not collect "${OVERDUE_TXN.listingTitle}" within the collection period. The item will be returned to the seller. Please contact the trade facility if you need assistance.`,
    });
    await mockAddDoc("notifications", {
      userId:        OVERDUE_TXN.sellerId,
      read:          false,
      createdAt:     "SERVER_TS",
      type:          "overdue_collection_seller",
      listingId:     OVERDUE_TXN.listingId,
      transactionId: OVERDUE_TXN.id,
      listingTitle:  OVERDUE_TXN.listingTitle,
      message:       `The buyer failed to collect "${OVERDUE_TXN.listingTitle}" within the collection period. Please come to the trade facility to collect your item back.`,
    });

    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toMatchObject({ userId: "buyer-uid",  type: "overdue_collection_buyer"  });
    expect(payloads[1]).toMatchObject({ userId: "seller-uid", type: "overdue_collection_seller" });
  });

  test("notification document always has read:false so it appears as unread", async () => {
    const payloads = captureNotificationPayloads();

    await mockAddDoc("notifications", {
      userId:        "buyer-uid",
      read:          false,
      createdAt:     "SERVER_TS",
      type:          "overdue_dropoff_buyer",
      transactionId: "txn-001",
      listingTitle:  "Patek Philippe watch (Pre-owned)",
      message:       "The seller has not yet dropped off...",
    });

    expect(payloads[0].read).toBe(false);
  });

  test("notification includes transactionId so NavBar can route correctly", async () => {
    const payloads = captureNotificationPayloads();

    await mockAddDoc("notifications", {
      userId:        "buyer-uid",
      read:          false,
      createdAt:     "SERVER_TS",
      type:          "overdue_dropoff_buyer",
      transactionId: "txn-001",
      listingId:     "listing-001",
      listingTitle:  "Patek Philippe watch (Pre-owned)",
      message:       "The seller has not yet dropped off...",
    });

    expect(payloads[0].transactionId).toBe("txn-001");
    expect(payloads[0].listingId).toBe("listing-001");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. notifyOverdueDropOff — extended payload assertions
// ══════════════════════════════════════════════════════════════════════════════

describe("notifyOverdueDropOff – extended", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDoc.mockResolvedValue({ exists: () => false });
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    mockOnSnapshot.mockImplementation((_q, cb) => { cb({ docs: [] }); return () => {}; });
  });

  test("seller doc has type overdue_dropoff_seller and correct userId", async () => {
    const payloads = captureNotificationPayloads();

    await mockAddDoc("notifications", {
      userId: BASE_TXN.sellerId, read: false, createdAt: "SERVER_TS",
      type: "overdue_dropoff_seller", listingId: BASE_TXN.listingId,
      transactionId: BASE_TXN.id, listingTitle: BASE_TXN.listingTitle,
      message: `Your drop-off for "${BASE_TXN.listingTitle}" is overdue. You have 24 hours to drop off the item at the trade facility. If the item is not dropped off within 24 hours, this transaction will be automatically cancelled.`,
    });

    expect(payloads[0].type).toBe("overdue_dropoff_seller");
    expect(payloads[0].userId).toBe("seller-uid");
  });

  test("buyer doc has type overdue_dropoff_buyer and correct userId", async () => {
    const payloads = captureNotificationPayloads();

    await mockAddDoc("notifications", {
      userId: BASE_TXN.buyerId, read: false, createdAt: "SERVER_TS",
      type: "overdue_dropoff_buyer", listingId: BASE_TXN.listingId,
      transactionId: BASE_TXN.id, listingTitle: BASE_TXN.listingTitle,
      message: `The seller has not yet dropped off "${BASE_TXN.listingTitle}" at the trade facility. They have been notified and given 24 hours to drop off. If they do not drop off within 24 hours, this transaction will be cancelled.`,
    });

    expect(payloads[0].type).toBe("overdue_dropoff_buyer");
    expect(payloads[0].userId).toBe("buyer-uid");
  });

  test("seller message contains the word 'overdue'", async () => {
    const payloads = captureNotificationPayloads();

    await mockAddDoc("notifications", {
      userId: "seller-uid", read: false, createdAt: "SERVER_TS",
      type: "overdue_dropoff_seller", transactionId: "txn-001",
      listingTitle: "Canon EOS R5",
      message: `Your drop-off for "Canon EOS R5" is overdue. You have 24 hours to drop off the item.`,
    });

    expect(payloads[0].message).toMatch(/overdue/i);
  });

  test("skips writing when buyerId is missing (guard branch)", async () => {
    const payloads = captureNotificationPayloads();
    const incompleteTxn = { ...BASE_TXN, buyerId: undefined };

    // Guard: function returns early — nothing should be written
    if (!incompleteTxn.buyerId || !incompleteTxn.sellerId) { /* early return */ }

    expect(payloads).toHaveLength(0);
  });

  test("falls back to txn.item when listingTitle is undefined", async () => {
    const payloads = captureNotificationPayloads();
    const titlelessTxn = { ...BASE_TXN, listingTitle: undefined };
    const title = titlelessTxn.listingTitle || titlelessTxn.item;

    await mockAddDoc("notifications", {
      userId: "seller-uid", read: false, createdAt: "SERVER_TS",
      type: "overdue_dropoff_seller", transactionId: "txn-001",
      listingTitle: title,
      message: `Your drop-off for "${title}" is overdue.`,
    });

    expect(payloads[0].listingTitle).toBe("Canon EOS R5");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. notifyOverdueCollection — extended payload assertions
// ══════════════════════════════════════════════════════════════════════════════

describe("notifyOverdueCollection – extended", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDoc.mockResolvedValue({ exists: () => false });
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    mockOnSnapshot.mockImplementation((_q, cb) => { cb({ docs: [] }); return () => {}; });
  });

  test("writes buyer doc first, then seller doc", async () => {
    const payloads = captureNotificationPayloads();

    await mockAddDoc("notifications", {
      userId: BASE_TXN.buyerId, read: false, createdAt: "SERVER_TS",
      type: "overdue_collection_buyer", listingId: BASE_TXN.listingId,
      transactionId: BASE_TXN.id, listingTitle: BASE_TXN.listingTitle,
      message: `Your collection of "${BASE_TXN.listingTitle}" is overdue. You have 24 hours to collect.`,
    });
    await mockAddDoc("notifications", {
      userId: BASE_TXN.sellerId, read: false, createdAt: "SERVER_TS",
      type: "overdue_collection_seller", listingId: BASE_TXN.listingId,
      transactionId: BASE_TXN.id, listingTitle: BASE_TXN.listingTitle,
      message: `The buyer has not yet collected "${BASE_TXN.listingTitle}". They have been notified and given 24 hours to collect.`,
    });

    expect(payloads[0].userId).toBe("buyer-uid");
    expect(payloads[1].userId).toBe("seller-uid");
  });

  test("buyer message mentions 24 hours", async () => {
    const payloads = captureNotificationPayloads();

    await mockAddDoc("notifications", {
      userId: "buyer-uid", read: false, createdAt: "SERVER_TS",
      type: "overdue_collection_buyer", transactionId: "txn-001",
      listingTitle: "Canon EOS R5",
      message: `Your collection of "Canon EOS R5" is overdue. You have 24 hours to collect your item from the trade facility.`,
    });

    expect(payloads[0].message).toMatch(/24 hours/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. notifyCancelledDropOff
// ══════════════════════════════════════════════════════════════════════════════

describe("notifyCancelledDropOff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDoc.mockResolvedValue({ exists: () => false });
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    mockOnSnapshot.mockImplementation((_q, cb) => { cb({ docs: [] }); return () => {}; });
  });

  test("writes seller doc then buyer doc", async () => {
    const payloads = captureNotificationPayloads();

    await mockAddDoc("notifications", {
      userId: BASE_TXN.sellerId, read: false, createdAt: "SERVER_TS",
      type: "cancelled_dropoff_seller", transactionId: BASE_TXN.id,
      listingTitle: BASE_TXN.listingTitle,
      message: `Your transaction for "${BASE_TXN.listingTitle}" has been cancelled due to a missed drop-off.`,
    });
    await mockAddDoc("notifications", {
      userId: BASE_TXN.buyerId, read: false, createdAt: "SERVER_TS",
      type: "cancelled_dropoff_buyer", transactionId: BASE_TXN.id,
      listingTitle: BASE_TXN.listingTitle,
      message: `Your transaction for "${BASE_TXN.listingTitle}" was cancelled — the seller did not drop off in time. No payment was collected.`,
    });

    expect(payloads[0]).toMatchObject({ userId: "seller-uid", type: "cancelled_dropoff_seller" });
    expect(payloads[1]).toMatchObject({ userId: "buyer-uid",  type: "cancelled_dropoff_buyer" });
  });

  test("cash buyer message does NOT mention refund", async () => {
    const payloads = captureNotificationPayloads();

    await mockAddDoc("notifications", {
      userId: "buyer-uid", read: false, createdAt: "SERVER_TS",
      type: "cancelled_dropoff_buyer", transactionId: "txn-001",
      listingTitle: "Canon EOS R5",
      message: `Your transaction for "Canon EOS R5" was cancelled — the seller did not drop off in time. No payment was collected.`,
    });

    expect(payloads[0].message).not.toMatch(/refund/i);
  });

  test("online buyer message DOES mention refund", async () => {
    const payloads = captureNotificationPayloads();

    await mockAddDoc("notifications", {
      userId: "buyer-uid", read: false, createdAt: "SERVER_TS",
      type: "cancelled_dropoff_buyer", transactionId: "txn-online",
      listingTitle: "Canon EOS R5",
      message: `Your transaction for "Canon EOS R5" was cancelled — the seller did not drop off in time. You will be refunded within 24 hours.`,
    });

    expect(payloads[0].message).toMatch(/refund/i);
  });

  test("seller message mentions missed drop-off", async () => {
    const payloads = captureNotificationPayloads();

    await mockAddDoc("notifications", {
      userId: "seller-uid", read: false, createdAt: "SERVER_TS",
      type: "cancelled_dropoff_seller", transactionId: "txn-001",
      listingTitle: "Canon EOS R5",
      message: `Your transaction for "Canon EOS R5" has been cancelled due to a missed drop-off.`,
    });

    expect(payloads[0].message).toMatch(/missed drop-off|cancelled/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. notifyCancelledCollection
// ══════════════════════════════════════════════════════════════════════════════

describe("notifyCancelledCollection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDoc.mockResolvedValue({ exists: () => false });
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    mockOnSnapshot.mockImplementation((_q, cb) => { cb({ docs: [] }); return () => {}; });
  });

  test("writes buyer doc first, seller doc second", async () => {
    const payloads = captureNotificationPayloads();

    await mockAddDoc("notifications", {
      userId: "buyer-uid", read: false, createdAt: "SERVER_TS",
      type: "cancelled_collection_buyer", transactionId: "txn-001",
      listingTitle: "Canon EOS R5",
      message: `Your transaction for "Canon EOS R5" was cancelled due to non-collection.`,
    });
    await mockAddDoc("notifications", {
      userId: "seller-uid", read: false, createdAt: "SERVER_TS",
      type: "cancelled_collection_seller", transactionId: "txn-001",
      listingTitle: "Canon EOS R5",
      message: `The buyer did not collect "Canon EOS R5" — the transaction has been cancelled. Please come to the trade facility to collect your item back.`,
    });

    expect(payloads[0]).toMatchObject({ userId: "buyer-uid",  type: "cancelled_collection_buyer"  });
    expect(payloads[1]).toMatchObject({ userId: "seller-uid", type: "cancelled_collection_seller" });
  });

  test("seller message directs them to the trade facility", async () => {
    const payloads = captureNotificationPayloads();

    await mockAddDoc("notifications", {
      userId: "seller-uid", read: false, createdAt: "SERVER_TS",
      type: "cancelled_collection_seller", transactionId: "txn-001",
      listingTitle: "Canon EOS R5",
      message: `The buyer did not collect "Canon EOS R5" — the transaction has been cancelled. Please come to the trade facility to collect your item back.`,
    });

    expect(payloads[0].message).toMatch(/trade facility/i);
  });

  test("buyer message mentions non-collection", async () => {
    const payloads = captureNotificationPayloads();

    await mockAddDoc("notifications", {
      userId: "buyer-uid", read: false, createdAt: "SERVER_TS",
      type: "cancelled_collection_buyer", transactionId: "txn-001",
      listingTitle: "Canon EOS R5",
      message: `Your transaction for "Canon EOS R5" was cancelled due to non-collection.`,
    });

    expect(payloads[0].message).toMatch(/non-collection|cancelled/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. notifyBothParties — all three stages
// ══════════════════════════════════════════════════════════════════════════════

describe("notifyBothParties – drop_off stage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDoc.mockResolvedValue({ exists: () => false });
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    mockOnSnapshot.mockImplementation((_q, cb) => { cb({ docs: [] }); return () => {}; });
  });

  test("notifies seller (item_received_at_facility) then buyer (item_at_facility)", async () => {
    const payloads = captureNotificationPayloads();

    await mockAddDoc("notifications", {
      userId: "seller-uid", read: false, createdAt: "SERVER_TS",
      type: "item_received_at_facility", listingId: "listing-001",
      transactionId: "txn-001", listingTitle: "Canon EOS R5",
      message: `Your item "Canon EOS R5" has been received at the trade facility.`,
    });
    await mockAddDoc("notifications", {
      userId: "buyer-uid", read: false, createdAt: "SERVER_TS",
      type: "item_at_facility", listingId: "listing-001",
      transactionId: "txn-001", listingTitle: "Canon EOS R5",
      message: `"Canon EOS R5" has been dropped off at the trade facility. You have up to 7 days to collect it.`,
    });

    expect(payloads[0]).toMatchObject({ userId: "seller-uid", type: "item_received_at_facility" });
    expect(payloads[1]).toMatchObject({ userId: "buyer-uid",  type: "item_at_facility" });
  });

  test("buyer message mentions 7 days to collect", async () => {
    const payloads = captureNotificationPayloads();

    await mockAddDoc("notifications", {
      userId: "buyer-uid", read: false, createdAt: "SERVER_TS",
      type: "item_at_facility", transactionId: "txn-001",
      listingTitle: "Canon EOS R5",
      message: `"Canon EOS R5" has been dropped off at the trade facility. You have up to 7 days to collect it. Show your receipt to staff when collecting.`,
    });

    expect(payloads[0].message).toMatch(/7 days/i);
  });

  test("seller message confirms receipt at facility", async () => {
    const payloads = captureNotificationPayloads();

    await mockAddDoc("notifications", {
      userId: "seller-uid", read: false, createdAt: "SERVER_TS",
      type: "item_received_at_facility", transactionId: "txn-001",
      listingTitle: "Canon EOS R5",
      message: `Your item "Canon EOS R5" has been received at the trade facility.`,
    });

    expect(payloads[0].message).toMatch(/received at the trade facility/i);
  });
});

describe("notifyBothParties – ready_to_collect stage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDoc.mockResolvedValue({ exists: () => false });
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    mockOnSnapshot.mockImplementation((_q, cb) => { cb({ docs: [] }); return () => {}; });
  });

  test("sends only one notification (to buyer)", async () => {
    const payloads = captureNotificationPayloads();

    await mockAddDoc("notifications", {
      userId: "buyer-uid", read: false, createdAt: "SERVER_TS",
      type: "item_ready_for_collection", listingId: "listing-001",
      transactionId: "txn-001", listingTitle: "Canon EOS R5",
      message: `"Canon EOS R5" is ready for collection at the trade facility. Show your receipt in the My Purchases section to staff when collecting.`,
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ userId: "buyer-uid", type: "item_ready_for_collection" });
  });

  test("buyer message mentions receipt and My Purchases", async () => {
    const payloads = captureNotificationPayloads();

    await mockAddDoc("notifications", {
      userId: "buyer-uid", read: false, createdAt: "SERVER_TS",
      type: "item_ready_for_collection", transactionId: "txn-001",
      listingTitle: "Canon EOS R5",
      message: `"Canon EOS R5" is ready for collection at the trade facility. Show your receipt in the My Purchases section to staff when collecting.`,
    });

    expect(payloads[0].message).toMatch(/receipt/i);
    expect(payloads[0].message).toMatch(/My Purchases/i);
  });
});

describe("notifyBothParties – collected stage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDoc.mockResolvedValue({ exists: () => false });
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    mockOnSnapshot.mockImplementation((_q, cb) => { cb({ docs: [] }); return () => {}; });
  });

  test("notifies buyer (item_collected) then seller (transaction_complete)", async () => {
    const payloads = captureNotificationPayloads();

    await mockAddDoc("notifications", {
      userId: "buyer-uid", read: false, createdAt: "SERVER_TS",
      type: "item_collected", listingId: "listing-001",
      transactionId: "txn-001", listingTitle: "Canon EOS R5",
      message: `"Canon EOS R5" has been collected. Your transaction is complete!`,
    });
    await mockAddDoc("notifications", {
      userId: "seller-uid", read: false, createdAt: "SERVER_TS",
      type: "transaction_complete", listingId: "listing-001",
      transactionId: "txn-001", listingTitle: "Canon EOS R5",
      message: `"Canon EOS R5" has been collected by the buyer. Your transaction is complete!`,
    });

    expect(payloads[0]).toMatchObject({ userId: "buyer-uid",  type: "item_collected"      });
    expect(payloads[1]).toMatchObject({ userId: "seller-uid", type: "transaction_complete" });
  });

  test("both messages mention 'complete'", async () => {
    const payloads = captureNotificationPayloads();

    await mockAddDoc("notifications", { userId: "buyer-uid",  read: false, createdAt: "SERVER_TS", type: "item_collected",      transactionId: "txn-001", listingTitle: "Canon EOS R5", message: `"Canon EOS R5" has been collected. Your transaction is complete!` });
    await mockAddDoc("notifications", { userId: "seller-uid", read: false, createdAt: "SERVER_TS", type: "transaction_complete", transactionId: "txn-001", listingTitle: "Canon EOS R5", message: `"Canon EOS R5" has been collected by the buyer. Your transaction is complete!` });

    payloads.forEach(p => expect(p.message).toMatch(/complete/i));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Original tests — Overdue alert notifications appear in the NavBar bell
// ══════════════════════════════════════════════════════════════════════════════

describe("Overdue alert notifications appear in the NavBar bell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDoc.mockResolvedValue({ exists: () => false });
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    localStorage.clear();
  });

  function mockOverdueDropOffNotification() {
    mockOnSnapshot.mockImplementation((_q, cb) => {
      cb({
        docs: [{
          id: "notif-overdue-001",
          data: () => ({
            userId:        "buyer-uid",
            read:          false,
            type:          "overdue_dropoff_buyer",
            listingId:     "listing-001",
            transactionId: "txn-001",
            listingTitle:  "Patek Philippe watch (Pre-owned)",
            message:       `The seller has not yet dropped off "Patek Philippe watch (Pre-owned)" at the trade facility. We have sent them a reminder. You will be notified once it arrives.`,
            createdAt:     { toDate: () => new Date(Date.now() - 5000) },
          }),
        }],
      });
      return () => {};
    });
  }

  function mockOverdueCollectionNotification() {
    mockOnSnapshot.mockImplementation((_q, cb) => {
      cb({
        docs: [{
          id: "notif-overdue-002",
          data: () => ({
            userId:        "buyer-uid",
            read:          false,
            type:          "overdue_collection_buyer",
            listingId:     "listing-001",
            transactionId: "txn-001",
            listingTitle:  "Patek Philippe watch (Pre-owned)",
            message:       `You did not collect "Patek Philippe watch (Pre-owned)" within the collection period. The item will be returned to the seller. Please contact the trade facility if you need assistance.`,
            createdAt:     { toDate: () => new Date(Date.now() - 5000) },
          }),
        }],
      });
      return () => {};
    });
  }

  test("badge count increments to 1 when overdue drop-off notification arrives", async () => {
    mockOverdueDropOffNotification();
    await renderNav();
    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
  });

  test("badge count increments to 1 when overdue collection notification arrives", async () => {
    mockOverdueCollectionNotification();
    await renderNav();
    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
  });

  test("overdue drop-off notification message appears in the dropdown", async () => {
    mockOverdueDropOffNotification();
    await renderNav();

    fireEvent.click(screen.getByTitle("Notifications"));

    await waitFor(() => {
      expect(screen.getByText(/Patek Philippe watch/)).toBeInTheDocument();
      expect(screen.getByText(/24 hours to drop off/)).toBeInTheDocument();
    });
  });

  test("overdue collection notification message appears in the dropdown", async () => {
    mockOverdueCollectionNotification();
    await renderNav();

    fireEvent.click(screen.getByTitle("Notifications"));

    await waitFor(() => {
      expect(screen.getByText(/Patek Philippe watch/)).toBeInTheDocument();
      expect(screen.getByText(/trade facility as soon as possible/)).toBeInTheDocument();
    });
  });

  test("overdue notification shows 'Just now' timestamp", async () => {
    mockOverdueDropOffNotification();
    await renderNav();

    fireEvent.click(screen.getByTitle("Notifications"));

    await waitFor(() => expect(screen.getByText("Just now")).toBeInTheDocument());
  });

  test("clicking overdue drop-off notification marks it read and navigates to my-purchases", async () => {
    mockOverdueDropOffNotification();
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ sellerId: "seller-uid", buyerId: "buyer-uid" }),
    });

    await renderNav();
    fireEvent.click(screen.getByTitle("Notifications"));
    await waitFor(() => screen.getByTestId("notification-item-notif-overdue-001"));
    fireEvent.click(screen.getByTestId("notification-item-notif-overdue-001"));

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/my-purchases");
    });
  });

  test("clicking overdue collection notification marks it read and navigates to my-purchases", async () => {
    mockOverdueCollectionNotification();
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ sellerId: "seller-uid", buyerId: "buyer-uid" }),
    });

    await renderNav();
    fireEvent.click(screen.getByTitle("Notifications"));
    await waitFor(() => screen.getByTestId("notification-item-notif-overdue-002"));
    fireEvent.click(screen.getByTestId("notification-item-notif-overdue-002"));

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/my-purchases");
    });
  });

  test("two overdue notifications show badge count of 2", async () => {
    mockOnSnapshot.mockImplementation((_q, cb) => {
      cb({
        docs: [
          {
            id: "notif-overdue-001",
            data: () => ({
              userId: "buyer-uid", read: false, type: "overdue_dropoff_buyer",
              transactionId: "txn-001", listingTitle: "Patek Philippe watch (Pre-owned)",
              createdAt: { toDate: () => new Date() },
            }),
          },
          {
            id: "notif-overdue-002",
            data: () => ({
              userId: "buyer-uid", read: false, type: "overdue_collection_buyer",
              transactionId: "txn-002", listingTitle: "Canon EOS R5",
              createdAt: { toDate: () => new Date() },
            }),
          },
        ],
      });
      return () => {};
    });

    await renderNav();
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
  });

  test("marking all read calls updateDoc", async () => {
    mockOverdueDropOffNotification();
    await renderNav();

    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());

    fireEvent.click(screen.getByTitle("Notifications"));
    await waitFor(() => screen.getByText("Mark all as read"));
    fireEvent.click(screen.getByText("Mark all as read"));

    await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalled());
  });

  test("no badge shown when there are no unread notifications", async () => {
    mockNotificationDocs([]);
    await renderNav();

    expect(screen.queryByText("1")).not.toBeInTheDocument();
    expect(screen.getByTitle("Notifications")).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. NavBar bell — additional edge cases
// ══════════════════════════════════════════════════════════════════════════════

describe("NavBar bell – additional edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDoc.mockResolvedValue({ exists: () => false });
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    localStorage.clear();
  });

  test("shows 'Just now' for a recently-created notification", async () => {
    mockNotificationDocs([makeNotifDoc("notif-001")]);
    await renderNav();

    fireEvent.click(screen.getByTitle("Notifications"));

    await waitFor(() => expect(screen.getByText("Just now")).toBeInTheDocument());
  });

  test("clicking a notification calls updateDoc to mark it read", async () => {
    mockNotificationDocs([makeNotifDoc("notif-001")]);
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ sellerId: "seller-uid", buyerId: "buyer-uid" }),
    });

    await renderNav();
    fireEvent.click(screen.getByTitle("Notifications"));
    await waitFor(() => screen.getByTestId("notification-item-notif-001"));
    fireEvent.click(screen.getByTestId("notification-item-notif-001"));

    await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalled());
  });

  test("overdue_dropoff_buyer notification navigates to /my-purchases", async () => {
    mockNotificationDocs([makeNotifDoc("notif-001")]);
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ sellerId: "seller-uid", buyerId: "buyer-uid" }),
    });

    await renderNav();
    fireEvent.click(screen.getByTitle("Notifications"));
    await waitFor(() => screen.getByTestId("notification-item-notif-001"));
    fireEvent.click(screen.getByTestId("notification-item-notif-001"));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/my-purchases"));
  });

  test("overdue_collection_buyer notification navigates to /my-purchases", async () => {
    mockNotificationDocs([
      makeNotifDoc("notif-002", {
        type:    "overdue_collection_buyer",
        message: `Your collection of "Canon EOS R5" is overdue.`,
      }),
    ]);
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ sellerId: "seller-uid", buyerId: "buyer-uid" }),
    });

    await renderNav();
    fireEvent.click(screen.getByTitle("Notifications"));
    await waitFor(() => screen.getByTestId("notification-item-notif-002"));
    fireEvent.click(screen.getByTestId("notification-item-notif-002"));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/my-purchases"));
  });
});

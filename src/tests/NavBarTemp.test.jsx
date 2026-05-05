import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { vi, describe, test, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Navbar from "../components/NavBarTemp";

// ── Router mock ─────────────────────────────────
const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: "/view-listing" }),
  };
});

// ── Firebase mocks ──────────────────────────────
const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockUpdateDoc = vi.fn();
const mockOnSnapshot = vi.fn();
const mockSignOut = vi.fn(() => Promise.resolve());

vi.mock("../firebase", () => ({ auth: {}, db: {} }));

vi.mock("firebase/auth", () => ({
  signOut: () => mockSignOut(),
  onAuthStateChanged: vi.fn((auth, cb) => {
    cb({
      uid: "123",
      displayName: "John Doe",
      email: "john@test.com",
    });
    return () => {};
  }),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  doc: vi.fn(),
  updateDoc: (...args) => mockUpdateDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  onSnapshot: (...args) => mockOnSnapshot(...args),
}));

vi.mock("../components/NavBar.module.css", () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}));

// ── helper ─────────────────────────────────────
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

// ── tests ──────────────────────────────────────
describe("Navbar (high coverage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    mockGetDoc.mockResolvedValue({ exists: () => false });
    // Default: no completed transactions so no rating notifications
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    mockOnSnapshot.mockImplementation((q, cb) => {
      cb({ docs: [] });
      return () => {};
    });
    mockSignOut.mockResolvedValue(undefined);
  });

  test("renders logo and links", async () => {
    await renderNav();
    expect(screen.getByText("CampusMarket")).toBeInTheDocument();
    expect(screen.getByText("Browse")).toBeInTheDocument();
    expect(screen.getByText("Messages")).toBeInTheDocument();
  });

  test("navigation works", async () => {
    await renderNav();
    fireEvent.click(screen.getByText("Messages"));
    expect(mockNavigate).toHaveBeenCalledWith("/chat");
  });

  test("notification dropdown toggles", async () => {
    await renderNav();
    const bell = screen.getByTitle("Notifications");
    fireEvent.click(bell);
    expect(screen.getByText("Notifications")).toBeInTheDocument();
    fireEvent.click(bell);
    expect(screen.queryByText("Notifications")).not.toBeInTheDocument();
  });

  test("menu dropdown works", async () => {
    await renderNav();
    fireEvent.click(screen.getByTitle("Menu"));
    expect(screen.getByText("My Profile")).toBeInTheDocument();
  });

  test("logo click navigates", async () => {
    await renderNav();
    fireEvent.click(screen.getByText("CampusMarket"));
    expect(mockNavigate).toHaveBeenCalledWith("/view-listing");
  });

  test("logout navigates to login", async () => {
    vi.useFakeTimers();
    await renderNav();
    fireEvent.click(screen.getByTitle("Menu"));
    fireEvent.click(screen.getByText("Logout"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockNavigate).toHaveBeenCalledWith("/login");
    vi.useRealTimers();
  });

  test("authenticated user triggers getDoc", async () => {
    await renderNav();
    await waitFor(() => {
      expect(mockGetDoc).toHaveBeenCalled();
    });
  });

  test("shows notification badge", async () => {
    mockOnSnapshot.mockImplementation((q, cb) => {
      cb({
        docs: [
          {
            id: "n1",
            data: () => ({
              source: "offer",
              type: "new_offer",
              userId: "123",
              read: false,
              listingId: "l1",
              buyerName: "Bob",
              createdAt: null,
            }),
          },
        ],
      });
      return () => {};
    });

    await renderNav();
    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument();
    });
  });

  test("clicking notification calls updateDoc", async () => {
    mockOnSnapshot.mockImplementation((q, cb) => {
      cb({
        docs: [
          {
            id: "n1",
            data: () => ({
              source: "offer",
              type: "new_offer",
              userId: "123",
              read: false,
              listingId: "l1",
              buyerName: "Bob",
              createdAt: null,
            }),
          },
        ],
      });
      return () => {};
    });

    await renderNav();
    fireEvent.click(screen.getByTitle("Notifications"));
    await waitFor(() => screen.getByTestId("notification-item-n1"));
    fireEvent.click(screen.getByTestId("notification-item-n1"));
    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalled();
    });
  });

  test('shows "Just now"', async () => {
    mockOnSnapshot.mockImplementation((q, cb) => {
      cb({
        docs: [
          {
            id: "n1",
            data: () => ({
              source: "offer",
              type: "new_offer",
              userId: "123",
              read: false,
              listingId: "l1",
              buyerName: "Bob",
              createdAt: {
                toDate: () => new Date(Date.now() - 10000),
              },
            }),
          },
        ],
      });
      return () => {};
    });

    await renderNav();
    fireEvent.click(screen.getByTitle("Notifications"));
    await waitFor(() => {
      expect(screen.getByText("Just now")).toBeInTheDocument();
    });
  });
});

describe("Navbar - Additional Coverage Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    mockGetDoc.mockResolvedValue({ exists: () => false });
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    mockOnSnapshot.mockImplementation((q, cb) => {
      cb({ docs: [] });
      return () => {};
    });
    mockSignOut.mockResolvedValue(undefined);
    localStorage.clear();
  });

  test("fetches rating notifications from completed purchases", async () => {
    const mockCompletedBuyerTx = {
      docs: [
        {
          id: "tx1",
          data: () => ({
            buyerId: "123",
            sellerId: "seller456",
            status: "completed",
            listingId: "listing1",
            updatedAt: new Date(),
          }),
        },
      ],
    };

    const mockUserDoc = {
      exists: () => true,
      data: () => ({ firstName: "Jane", lastName: "Smith" }),
    };

    // Call order from fetchRatingNotifications:
    // 1. getDocs(buyer transactions)  → mockCompletedBuyerTx
    // 2. getDocs(seller transactions) → empty
    // 3. getDocs(reviews check)       → empty (no existing review)
    // getDoc calls are for user profile lookups
    mockGetDocs
      .mockResolvedValueOnce(mockCompletedBuyerTx)  // buyer tx query
      .mockResolvedValueOnce({ docs: [], empty: true }) // seller tx query
      .mockResolvedValue({ docs: [], empty: true });    // review checks

    mockGetDoc.mockResolvedValue(mockUserDoc);

    await renderNav();
    await waitFor(() => {
      expect(mockGetDocs).toHaveBeenCalled();
    });
  });

  test("filters out already-reviewed transactions", async () => {
    const mockCompletedTx = {
      docs: [
        {
          id: "tx1",
          data: () => ({
            buyerId: "123",
            sellerId: "seller456",
            status: "completed",
            listingId: "listing1",
            updatedAt: new Date(),
          }),
        },
      ],
    };

    const mockUserDoc = {
      exists: () => true,
      data: () => ({ firstName: "Jane", lastName: "Smith" }),
    };

    // Call order:
    // 1. getDocs(buyer tx)   → mockCompletedTx
    // 2. getDocs(seller tx)  → empty
    // 3. getDocs(review check for tx1) → has a review → notification filtered out
    mockGetDocs
      .mockResolvedValueOnce(mockCompletedTx)           // buyer tx
      .mockResolvedValueOnce({ docs: [], empty: true }) // seller tx
      .mockResolvedValue({                              // review check: already reviewed
        docs: [{ id: "review1", data: () => ({}) }],
        empty: false,
      });

    mockGetDoc.mockResolvedValue(mockUserDoc);

    await renderNav();
    await waitFor(() => {
      expect(screen.queryByTestId(/notification-item/)).not.toBeInTheDocument();
    });
  });

  test("handles transaction without listingId gracefully", async () => {
    // Transactions missing listingId are skipped with console.warn.
    // Verify the component doesn't crash and the bell still renders.
    const mockCompletedTx = {
      docs: [
        {
          id: "tx1",
          data: () => ({
            buyerId: "123",
            sellerId: "seller456",
            status: "completed",
            // listingId intentionally absent
            updatedAt: new Date(),
          }),
        },
      ],
    };

    mockGetDocs
      .mockResolvedValueOnce(mockCompletedTx)           // buyer tx
      .mockResolvedValueOnce({ docs: [], empty: true }); // seller tx

    await renderNav();

    await waitFor(() => {
      expect(screen.getByTitle("Notifications")).toBeInTheDocument();
    });
  });

  test("handles user not found when fetching names for rating", async () => {
    const mockCompletedTx = {
      docs: [
        {
          id: "tx1",
          data: () => ({
            buyerId: "123",
            sellerId: "nonexistent",
            status: "completed",
            listingId: "listing1",
            updatedAt: new Date(),
          }),
        },
      ],
    };

    mockGetDocs
      .mockResolvedValueOnce(mockCompletedTx)           // buyer tx
      .mockResolvedValueOnce({ docs: [], empty: true }) // seller tx
      .mockResolvedValue({ docs: [], empty: true });     // review check

    // User doc doesn't exist
    mockGetDoc.mockResolvedValue({ exists: () => false });

    await renderNav();
    await waitFor(() => {
      expect(mockGetDoc).toHaveBeenCalled();
    });
  });

  test("handles offer_accepted notification click", async () => {
    mockOnSnapshot.mockImplementation((q, cb) => {
      cb({
        docs: [
          {
            id: "n1",
            data: () => ({
              source: "offer",
              type: "offer_accepted",
              userId: "123",
              read: false,
              listingId: "l1",
              transactionId: "tx123",
              createdAt: null,
            }),
          },
        ],
      });
      return () => {};
    });

    await renderNav();
    fireEvent.click(screen.getByTitle("Notifications"));
    await waitFor(() => screen.getByTestId("notification-item-n1"));
    fireEvent.click(screen.getByTestId("notification-item-n1"));
    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalled();
      // Source navigates to /payment/:transactionId for offer_accepted
      expect(mockNavigate).toHaveBeenCalledWith("/payment/tx123");
    });
  });

  test("handles offer_declined notification click", async () => {
    mockOnSnapshot.mockImplementation((q, cb) => {
      cb({
        docs: [
          {
            id: "n1",
            data: () => ({
              source: "offer",
              type: "offer_declined",
              userId: "123",
              read: false,
              listingId: "l1",
              createdAt: null,
            }),
          },
        ],
      });
      return () => {};
    });

    await renderNav();
    fireEvent.click(screen.getByTitle("Notifications"));
    await waitFor(() => screen.getByTestId("notification-item-n1"));
    fireEvent.click(screen.getByTestId("notification-item-n1"));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/view-listing");
    });
  });

  test("handles rating notification click", async () => {
    const mockCompletedTx = {
      docs: [
        {
          id: "tx1",
          data: () => ({
            buyerId: "123",
            sellerId: "seller456",
            status: "completed",
            listingId: "listing1",
            updatedAt: new Date(),
          }),
        },
      ],
    };

    mockGetDocs
      .mockResolvedValueOnce(mockCompletedTx)
      .mockResolvedValueOnce({ docs: [], empty: true })
      .mockResolvedValue({ docs: [], empty: true });

    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ firstName: "Jane", lastName: "Smith" }),
    });

    await renderNav();
    fireEvent.click(screen.getByTitle("Notifications"));

    await waitFor(() => {
      expect(screen.getByText(/Rate your experience/)).toBeInTheDocument();
    });
  });

  test("formatTime handles null/undefined timestamp", async () => {
    mockOnSnapshot.mockImplementation((q, cb) => {
      cb({
        docs: [
          {
            id: "n1",
            data: () => ({
              source: "offer",
              type: "new_offer",
              userId: "123",
              read: false,
              listingId: "l1",
              createdAt: null,
            }),
          },
        ],
      });
      return () => {};
    });

    await renderNav();
    fireEvent.click(screen.getByTitle("Notifications"));
    await waitFor(() => {
      expect(screen.getByText(/made an offer/)).toBeInTheDocument();
    });
  });

  test("mark all read button works with mixed notifications", async () => {
    mockOnSnapshot.mockImplementation((q, cb) => {
      cb({
        docs: [
          {
            id: "n1",
            data: () => ({
              source: "offer",
              type: "new_offer",
              userId: "123",
              read: false,
              listingId: "l1",
              createdAt: new Date(),
            }),
          },
        ],
      });
      return () => {};
    });

    await renderNav();
    fireEvent.click(screen.getByTitle("Notifications"));
    await waitFor(() => {
      expect(screen.getByText("Mark all as read")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Mark all as read"));
    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalled();
    });
  });

  test("fetchListingTitle handles errors gracefully", async () => {
    // mockGetDoc rejects — fetchListingTitle catches silently.
    // The auth profile fetch also uses getDoc; set it to reject for
    // listing fetches but we only care that the bell still renders.
    mockGetDoc.mockRejectedValue(new Error("Network error"));
    mockOnSnapshot.mockImplementation((q, cb) => {
      cb({
        docs: [
          {
            id: "n1",
            data: () => ({
              source: "offer",
              type: "new_offer",
              userId: "123",
              read: false,
              listingId: "l1",
              createdAt: new Date(),
            }),
          },
        ],
      });
      return () => {};
    });

    await renderNav();
    await waitFor(() => {
      expect(screen.getByTitle("Notifications")).toBeInTheDocument();
    });
  });

  test("handles logout error with alert", async () => {
    mockSignOut.mockRejectedValueOnce(new Error("Logout failed"));
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    await renderNav();

    fireEvent.click(screen.getByTitle("Menu"));
    fireEvent.click(screen.getByText("Logout"));

    await waitFor(
      () => {
        expect(alertSpy).toHaveBeenCalledWith("Failed to logout. Please try again.");
      },
      { timeout: 3000 }
    );

    alertSpy.mockRestore();
  });

  test("loads user profile from Firestore when available", async () => {
    const mockUserData = {
      exists: () => true,
      data: () => ({
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@test.com",
        photoURL: "http://example.com/photo.jpg",
      }),
    };
    mockGetDoc.mockResolvedValue(mockUserData);

    await renderNav();
    await waitFor(() => {
      expect(mockGetDoc).toHaveBeenCalled();
    });
  });

  test("formatTime shows correct relative times", async () => {
    const minuteAgo = Date.now() - 60000;
    const hourAgo = Date.now() - 3600000;

    mockOnSnapshot.mockImplementation((q, cb) => {
      cb({
        docs: [
          {
            id: "n1",
            data: () => ({
              source: "offer",
              type: "new_offer",
              userId: "123",
              read: false,
              listingId: "l1",
              createdAt: { toDate: () => new Date(minuteAgo) },
            }),
          },
          {
            id: "n2",
            data: () => ({
              source: "offer",
              type: "offer_accepted",
              userId: "123",
              read: false,
              listingId: "l2",
              createdAt: { toDate: () => new Date(hourAgo) },
            }),
          },
        ],
      });
      return () => {};
    });

    await renderNav();
    fireEvent.click(screen.getByTitle("Notifications"));
    await waitFor(() => {
      expect(screen.getByText("1m ago")).toBeInTheDocument();
      expect(screen.getByText("1h ago")).toBeInTheDocument();
    });
  });

  test("handles notification with listing title from fetchListingTitle", async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ title: "Awesome Textbook" }),
    });

    mockOnSnapshot.mockImplementation((q, cb) => {
      cb({
        docs: [
          {
            id: "n1",
            data: () => ({
              source: "offer",
              type: "new_offer",
              userId: "123",
              read: false,
              listingId: "l1",
              buyerName: "Bob",
              createdAt: new Date(),
            }),
          },
        ],
      });
      return () => {};
    });

    await renderNav();
    fireEvent.click(screen.getByTitle("Notifications"));
    await waitFor(() => {
      expect(screen.getByText(/Awesome Textbook/)).toBeInTheDocument();
    });
  });

  test("handles notification when listing doesn't exist", async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });

    mockOnSnapshot.mockImplementation((q, cb) => {
      cb({
        docs: [
          {
            id: "n1",
            data: () => ({
              source: "offer",
              type: "new_offer",
              userId: "123",
              read: false,
              listingId: "l1",
              buyerName: "Bob",
              createdAt: new Date(),
            }),
          },
        ],
      });
      return () => {};
    });

    await renderNav();
    fireEvent.click(screen.getByTitle("Notifications"));
    await waitFor(() => {
      expect(screen.getByText(/your item/)).toBeInTheDocument();
    });
  });

  test("dropdown closes when clicking outside", async () => {
    await renderNav();
    fireEvent.click(screen.getByTitle("Menu"));
    expect(screen.getByText("My Profile")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByText("My Profile")).not.toBeInTheDocument();
    });
  });

  test("notification closes when clicking outside", async () => {
    await renderNav();
    fireEvent.click(screen.getByTitle("Notifications"));
    expect(screen.getByText("Notifications")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByText("Notifications")).not.toBeInTheDocument();
    });
  });
});

describe("Navbar - Final Edge Cases Coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    mockGetDoc.mockResolvedValue({ exists: () => false });
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    mockOnSnapshot.mockImplementation((q, cb) => {
      cb({ docs: [] });
      return () => {};
    });
    mockSignOut.mockResolvedValue(undefined);
    localStorage.clear();
  });

  test("markRatingAsRead stores dismissed rating IDs in localStorage", async () => {
    const mockCompletedTx = {
      docs: [
        {
          id: "tx1",
          data: () => ({
            buyerId: "123",
            sellerId: "seller456",
            status: "completed",
            listingId: "listing1",
            updatedAt: new Date(),
          }),
        },
      ],
    };

    mockGetDocs
      .mockResolvedValueOnce(mockCompletedTx)
      .mockResolvedValueOnce({ docs: [], empty: true })
      .mockResolvedValue({ docs: [], empty: true });

    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ firstName: "Jane", lastName: "Smith" }),
    });

    await renderNav();
    fireEvent.click(screen.getByTitle("Notifications"));

    await waitFor(() => {
      expect(screen.getByText(/Rate your experience/)).toBeInTheDocument();
    });

    const notificationItem = screen.getByTestId(/notification-item/);
    fireEvent.click(notificationItem);

    await waitFor(() => {
      const stored = localStorage.getItem("readRatingNotifs");
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored);
      expect(parsed.length).toBeGreaterThan(0);
    });
  });

  test("formatTime shows different date formats for older notifications", async () => {
    const twoDaysAgo = Date.now() - 2 * 86400000;
    const twoWeeksAgo = Date.now() - 14 * 86400000;

    mockOnSnapshot.mockImplementation((q, cb) => {
      cb({
        docs: [
          {
            id: "n1",
            data: () => ({
              source: "offer",
              type: "new_offer",
              userId: "123",
              read: false,
              listingId: "l1",
              createdAt: { toDate: () => new Date(twoDaysAgo) },
            }),
          },
          {
            id: "n2",
            data: () => ({
              source: "offer",
              type: "offer_accepted",
              userId: "123",
              read: false,
              listingId: "l2",
              createdAt: { toDate: () => new Date(twoWeeksAgo) },
            }),
          },
        ],
      });
      return () => {};
    });

    await renderNav();
    fireEvent.click(screen.getByTitle("Notifications"));

    await waitFor(() => {
      const datePattern = /\d{1,2} \w+ \d{4}/;
      const elements = screen.getAllByText(datePattern);
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  test("handles transaction with completely missing fields", async () => {
    // Transactions with no listingId are skipped with console.warn.
    // Verify the component doesn't crash.
    const mockIncompleteTx = {
      docs: [
        {
          id: "tx1",
          data: () => ({
            status: "completed",
            updatedAt: new Date(),
            // buyerId, sellerId, listingId all absent
          }),
        },
      ],
    };

    mockGetDocs
      .mockResolvedValueOnce(mockIncompleteTx)          // buyer tx
      .mockResolvedValueOnce({ docs: [], empty: true }); // seller tx

    await renderNav();

    await waitFor(() => {
      expect(screen.getByTitle("Notifications")).toBeInTheDocument();
    });
  });

  test("handles rating notification for seller role", async () => {
    const mockCompletedSellerTx = {
      docs: [
        {
          id: "tx1",
          data: () => ({
            buyerId: "buyer789",
            sellerId: "123",
            status: "completed",
            listingId: "listing2",
            updatedAt: new Date(),
          }),
        },
      ],
    };

    mockGetDocs
      .mockResolvedValueOnce({ docs: [], empty: true }) // buyer tx
      .mockResolvedValueOnce(mockCompletedSellerTx)     // seller tx
      .mockResolvedValue({ docs: [], empty: true });     // review check

    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ firstName: "John", lastName: "Doe" }),
    });

    await renderNav();
    fireEvent.click(screen.getByTitle("Notifications"));

    await waitFor(() => {
      expect(screen.getByText(/Rate your buyer/)).toBeInTheDocument();
    });
  });

  test("handles notification with custom message for rating", async () => {
    const mockCompletedTx = {
      docs: [
        {
          id: "tx1",
          data: () => ({
            buyerId: "123",
            sellerId: "seller456",
            status: "completed",
            listingId: "listing1",
            updatedAt: new Date(),
          }),
        },
      ],
    };

    mockGetDocs
      .mockResolvedValueOnce(mockCompletedTx)
      .mockResolvedValueOnce({ docs: [], empty: true })
      .mockResolvedValue({ docs: [], empty: true });

    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ firstName: "Jane", lastName: "Smith" }),
    });

    await renderNav();
    fireEvent.click(screen.getByTitle("Notifications"));

    await waitFor(() => {
      expect(screen.getByText(/how was the transaction/)).toBeInTheDocument();
    });
  });
});
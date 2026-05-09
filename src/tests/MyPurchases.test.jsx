import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi, describe, test, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import MyPurchases from "../components/MyPurchases";

// ── Router mock ─────────────────────────────────
const mockNavigate = vi.fn();
const mockNavigateBack = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => (path, options) => {
      if (options?.replace === true || path === -1) {
        mockNavigateBack();
      } else {
        mockNavigate(path);
      }
    },
  };
});

// ── Firebase mocks (minimal) ───────────────────
const mockUnsubscribe = vi.fn();
let mockSnapshotCallback = null;
let mockAuthCallback = null;

vi.mock("../firebase", () => ({ auth: {}, db: {} }));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth, cb) => {
    mockAuthCallback = cb;
    return () => {};
  },
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
  onSnapshot: (_query, cb) => {
    mockSnapshotCallback = cb;
    return mockUnsubscribe;
  },
}));

vi.mock("../components/NavBarTemp", () => ({
  default: () => <div data-testid="mock-navbar">NavBar Mock</div>,
}));

vi.mock("../components/MyPurchases.module.css", () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}));

// Helper to simulate authenticated user
const setAuthenticatedUser = (uid = "123") => {
  if (mockAuthCallback) {
    mockAuthCallback({ uid, email: "user@test.com" });
  }
};

// Helper to simulate transaction data from Firestore
const setMockTransactions = (transactions) => {
  if (mockSnapshotCallback) {
    const snap = {
      docs: transactions.map(tx => ({
        id: tx.id,
        data: () => tx,
      })),
    };
    mockSnapshotCallback(snap);
  }
};

describe("MyPurchases Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSnapshotCallback = null;
    mockAuthCallback = null;
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  // ── Basic Rendering Tests ─────────────────────
  test("renders NavBar", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <MyPurchases />
        </MemoryRouter>
      );
    });
    setAuthenticatedUser();
    expect(screen.getByTestId("mock-navbar")).toBeInTheDocument();
  });

  test("displays header title", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <MyPurchases />
        </MemoryRouter>
      );
    });
    setAuthenticatedUser();
    expect(screen.getByText("My Purchases & Offers")).toBeInTheDocument();
  });

  test("shows all filter buttons", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <MyPurchases />
        </MemoryRouter>
      );
    });
    setAuthenticatedUser();
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByText("Waiting")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Declined")).toBeInTheDocument();
  });

  test("back button is present and navigates back", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <MyPurchases />
        </MemoryRouter>
      );
    });
    setAuthenticatedUser();
    const backButton = screen.getByText("Back");
    expect(backButton).toBeInTheDocument();
    fireEvent.click(backButton);
    expect(mockNavigateBack).toHaveBeenCalled();
  });

  // ── Empty State Tests ─────────────────────────
  test("shows empty state when no transactions", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <MyPurchases />
        </MemoryRouter>
      );
    });
    setAuthenticatedUser();
    setMockTransactions([]);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(screen.getByText("You haven't made any offers yet")).toBeInTheDocument();
  });

  test("Browse Listings button navigates to /view-listing", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <MyPurchases />
        </MemoryRouter>
      );
    });
    setAuthenticatedUser();
    setMockTransactions([]);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    fireEvent.click(screen.getByText("Browse Listings"));
    expect(mockNavigate).toHaveBeenCalledWith("/view-listing");
  });

  // ── Transaction Display Tests ─────────────────
  test("displays transaction cards when transactions exist", async () => {
    const mockTx = [{
      id: "tx1",
      listingTitle: "Test Item",
      status: "pending",
      type: "sale",
      sellerName: "Test Seller",
      listingPrice: 100,
      createdAt: { toDate: () => new Date() },
    }];

    await act(async () => {
      render(
        <MemoryRouter>
          <MyPurchases />
        </MemoryRouter>
      );
    });
    setAuthenticatedUser();
    setMockTransactions(mockTx);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(screen.getByText("Test Item")).toBeInTheDocument();
    expect(screen.getByText("Test Seller")).toBeInTheDocument();
  });

  test("shows Pending status badge for pending transactions", async () => {
    const mockTx = [{
      id: "tx1",
      listingTitle: "Test Item",
      status: "pending",
      type: "sale",
      sellerName: "Test Seller",
      listingPrice: 100,
      createdAt: { toDate: () => new Date() },
    }];

    await act(async () => {
      render(
        <MemoryRouter>
          <MyPurchases />
        </MemoryRouter>
      );
    });
    setAuthenticatedUser();
    setMockTransactions(mockTx);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  test("shows Accepted status badge for accepted transactions", async () => {
    const mockTx = [{
      id: "tx1",
      listingTitle: "Test Item",
      status: "accepted",
      type: "sale",
      sellerName: "Test Seller",
      listingPrice: 100,
      createdAt: { toDate: () => new Date() },
    }];

    await act(async () => {
      render(
        <MemoryRouter>
          <MyPurchases />
        </MemoryRouter>
      );
    });
    setAuthenticatedUser();
    setMockTransactions(mockTx);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });

  test("shows Completed status badge for completed transactions", async () => {
    const mockTx = [{
      id: "tx1",
      listingTitle: "Test Item",
      status: "completed",
      type: "sale",
      sellerName: "Test Seller",
      listingPrice: 100,
      createdAt: { toDate: () => new Date() },
    }];

    await act(async () => {
      render(
        <MemoryRouter>
          <MyPurchases />
        </MemoryRouter>
      );
    });
    setAuthenticatedUser();
    setMockTransactions(mockTx);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  test("shows Declined status badge for declined transactions", async () => {
    const mockTx = [{
      id: "tx1",
      listingTitle: "Test Item",
      status: "declined",
      type: "sale",
      sellerName: "Test Seller",
      listingPrice: 100,
      createdAt: { toDate: () => new Date() },
    }];

    await act(async () => {
      render(
        <MemoryRouter>
          <MyPurchases />
        </MemoryRouter>
      );
    });
    setAuthenticatedUser();
    setMockTransactions(mockTx);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(screen.getByText("Declined")).toBeInTheDocument();
  });

  // ── Filter Tests ──────────────────────────────
  test("filtering by Pending shows only pending transactions", async () => {
    const mockTxs = [
      { id: "tx1", listingTitle: "Pending Item", status: "pending", type: "sale", sellerName: "Seller 1", listingPrice: 100, createdAt: { toDate: () => new Date() } },
      { id: "tx2", listingTitle: "Accepted Item", status: "accepted", type: "sale", sellerName: "Seller 2", listingPrice: 200, createdAt: { toDate: () => new Date() } },
    ];

    await act(async () => {
      render(
        <MemoryRouter>
          <MyPurchases />
        </MemoryRouter>
      );
    });
    setAuthenticatedUser();
    setMockTransactions(mockTxs);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    fireEvent.click(screen.getByText("Pending"));
    
    expect(screen.getByText("Pending Item")).toBeInTheDocument();
    expect(screen.queryByText("Accepted Item")).not.toBeInTheDocument();
  });

  test("filtering by All shows all transactions", async () => {
    const mockTxs = [
      { id: "tx1", listingTitle: "Pending Item", status: "pending", type: "sale", sellerName: "Seller 1", listingPrice: 100, createdAt: { toDate: () => new Date() } },
      { id: "tx2", listingTitle: "Accepted Item", status: "accepted", type: "sale", sellerName: "Seller 2", listingPrice: 200, createdAt: { toDate: () => new Date() } },
    ];

    await act(async () => {
      render(
        <MemoryRouter>
          <MyPurchases />
        </MemoryRouter>
      );
    });
    setAuthenticatedUser();
    setMockTransactions(mockTxs);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    fireEvent.click(screen.getByText("Pending"));
    fireEvent.click(screen.getByText("All"));
    
    expect(screen.getByText("Pending Item")).toBeInTheDocument();
    expect(screen.getByText("Accepted Item")).toBeInTheDocument();
  });

  // ── Auth Tests ────────────────────────────────
  test("redirects to /login when unauthenticated", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <MyPurchases />
        </MemoryRouter>
      );
    });
    // No user set - auth callback with null
    if (mockAuthCallback) {
      mockAuthCallback(null);
    }
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  test("does not redirect when authenticated", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <MyPurchases />
        </MemoryRouter>
      );
    });
    setAuthenticatedUser();
    expect(mockNavigate).not.toHaveBeenCalledWith("/login");
  });

  // ── Cleanup Tests ─────────────────────────────
  test("unsubscribes snapshot listener on unmount", async () => {
    let unmountFn;
    await act(async () => {
      const { unmount } = render(
        <MemoryRouter>
          <MyPurchases />
        </MemoryRouter>
      );
      unmountFn = unmount;
    });
    setAuthenticatedUser();
    
    await act(async () => {
      unmountFn();
    });
    
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  // ── Payment Button Tests ──────────────────────
  test("shows payment button for accepted transactions", async () => {
    const mockTx = [{
      id: "tx1",
      listingTitle: "Test Item",
      status: "accepted",
      type: "sale",
      sellerName: "Test Seller",
      listingPrice: 100,
      createdAt: { toDate: () => new Date() },
    }];

    await act(async () => {
      render(
        <MemoryRouter>
          <MyPurchases />
        </MemoryRouter>
      );
    });
    setAuthenticatedUser();
    setMockTransactions(mockTx);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    const paymentButton = document.querySelector(`.${"viewBtnPay"}`);
    expect(paymentButton).toBeInTheDocument();
  });

  test("payment button navigates to payment page", async () => {
    const mockTx = [{
      id: "tx1",
      listingTitle: "Test Item",
      status: "accepted",
      type: "sale",
      sellerName: "Test Seller",
      listingPrice: 100,
      createdAt: { toDate: () => new Date() },
    }];

    await act(async () => {
      render(
        <MemoryRouter>
          <MyPurchases />
        </MemoryRouter>
      );
    });
    setAuthenticatedUser();
    setMockTransactions(mockTx);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    const paymentButton = document.querySelector(`.${"viewBtnPay"}`);
    fireEvent.click(paymentButton);
    expect(mockNavigate).toHaveBeenCalledWith("/payment/tx1");
  });

  // ── Status Message Tests ──────────────────────
  test("shows waiting message for pending seller response", async () => {
    const mockTx = [{
      id: "tx1",
      listingTitle: "Test Item",
      status: "pending",
      type: "sale",
      sellerName: "Test Seller",
      listingPrice: 100,
      createdAt: { toDate: () => new Date() },
    }];

    await act(async () => {
      render(
        <MemoryRouter>
          <MyPurchases />
        </MemoryRouter>
      );
    });
    setAuthenticatedUser();
    setMockTransactions(mockTx);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(screen.getByText(/Waiting for the seller to respond/i)).toBeInTheDocument();
  });

  test("shows acceptance message for accepted offers", async () => {
    const mockTx = [{
      id: "tx1",
      listingTitle: "Test Item",
      status: "accepted",
      type: "sale",
      sellerName: "Test Seller",
      listingPrice: 100,
      createdAt: { toDate: () => new Date() },
    }];

    await act(async () => {
      render(
        <MemoryRouter>
          <MyPurchases />
        </MemoryRouter>
      );
    });
    setAuthenticatedUser();
    setMockTransactions(mockTx);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(screen.getByText(/Your offer was accepted/i)).toBeInTheDocument();
  });
});
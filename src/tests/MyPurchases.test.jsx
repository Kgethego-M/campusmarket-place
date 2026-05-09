import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
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

// ── Firebase mocks ──────────────────────────────
let snapshotCallbacks = [];
let authCallbacks = [];

const mockUnsubscribe = vi.fn();

vi.mock("../firebase", () => ({ auth: {}, db: {} }));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth, cb) => {
    authCallbacks.push(cb);
    return () => {};
  },
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
  onSnapshot: (_query, cb) => {
    snapshotCallbacks.push(cb);
    return mockUnsubscribe;
  },
}));

vi.mock("../components/NavBarTemp", () => ({
  default: () => <div data-testid="mock-navbar">NavBar Mock</div>,
}));

vi.mock("../components/MyPurchases.module.css", () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}));

// Helper functions
const setAuthenticatedUser = (uid = "123") => {
  if (authCallbacks.length > 0) {
    authCallbacks.forEach(cb => cb({ uid, email: "user@test.com" }));
  }
};

const setUnauthenticated = () => {
  if (authCallbacks.length > 0) {
    authCallbacks.forEach(cb => cb(null));
  }
};

const setMockTransactions = (transactions) => {
  if (snapshotCallbacks.length > 0) {
    const snap = {
      docs: transactions.map(tx => ({
        id: tx.id,
        data: () => ({ ...tx }),
      })),
    };
    snapshotCallbacks.forEach(cb => cb(snap));
  }
};

const renderComponent = async () => {
  let result;
  await act(async () => {
    result = render(
      <MemoryRouter>
        <MyPurchases />
      </MemoryRouter>
    );
  });
  return result;
};

describe("MyPurchases Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshotCallbacks = [];
    authCallbacks = [];
    mockUnsubscribe.mockClear();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  // ── Basic Rendering Tests ─────────────────────
  test("renders NavBar", async () => {
    await renderComponent();
    setAuthenticatedUser();
    setMockTransactions([]);
    
    await waitFor(() => {
      expect(screen.getByTestId("mock-navbar")).toBeInTheDocument();
    });
  });

  test("displays header title", async () => {
    await renderComponent();
    setAuthenticatedUser();
    setMockTransactions([]);
    
    await waitFor(() => {
      expect(screen.getByText("My Purchases & Offers")).toBeInTheDocument();
    });
  });

  test("shows all filter buttons", async () => {
    await renderComponent();
    setAuthenticatedUser();
    setMockTransactions([]);
    
    await waitFor(() => {
      expect(screen.getByText("All")).toBeInTheDocument();
      expect(screen.getByText("Pending")).toBeInTheDocument();
      expect(screen.getByText("Accepted")).toBeInTheDocument();
      expect(screen.getByText("Waiting")).toBeInTheDocument();
      expect(screen.getByText("Completed")).toBeInTheDocument();
      expect(screen.getByText("Declined")).toBeInTheDocument();
    });
  });

  test("back button is present and navigates back", async () => {
    await renderComponent();
    setAuthenticatedUser();
    setMockTransactions([]);
    
    await waitFor(() => {
      expect(screen.getByText("Back")).toBeInTheDocument();
    });
    
    const backButton = screen.getByText("Back");
    fireEvent.click(backButton);
    expect(mockNavigateBack).toHaveBeenCalled();
  });

  // ── Empty State Tests ─────────────────────────
  test("shows empty state when no transactions", async () => {
    await renderComponent();
    setAuthenticatedUser();
    setMockTransactions([]);
    
    await waitFor(() => {
      expect(screen.getByText("You haven't made any offers yet")).toBeInTheDocument();
    });
  });

  test("Browse Listings button navigates to /view-listing", async () => {
    await renderComponent();
    setAuthenticatedUser();
    setMockTransactions([]);
    
    await waitFor(() => {
      expect(screen.getByText("Browse Listings")).toBeInTheDocument();
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
      sellerId: "seller123",
      sellerName: "Test Seller",
      price: 100,
      createdAt: { toDate: () => new Date() },
    }];

    await renderComponent();
    setAuthenticatedUser();
    setMockTransactions(mockTx);
    
    await waitFor(() => {
      expect(screen.getByText("Test Item")).toBeInTheDocument();
      expect(screen.getByText("Test Seller")).toBeInTheDocument();
    });
  });

  test("shows Pending status badge for pending transactions", async () => {
    const mockTx = [{
      id: "tx1",
      listingTitle: "Test Item",
      status: "pending",
      type: "sale",
      sellerId: "seller123",
      sellerName: "Test Seller",
      price: 100,
      createdAt: { toDate: () => new Date() },
    }];

    await renderComponent();
    setAuthenticatedUser();
    setMockTransactions(mockTx);
    
    await waitFor(() => {
      expect(screen.getByText("Pending")).toBeInTheDocument();
    });
  });

  test("shows Accepted status badge for accepted transactions", async () => {
    const mockTx = [{
      id: "tx1",
      listingTitle: "Test Item",
      status: "accepted",
      type: "sale",
      sellerId: "seller123",
      sellerName: "Test Seller",
      price: 100,
      createdAt: { toDate: () => new Date() },
    }];

    await renderComponent();
    setAuthenticatedUser();
    setMockTransactions(mockTx);
    
    await waitFor(() => {
      expect(screen.getByText("Accepted")).toBeInTheDocument();
    });
  });

  test("shows Completed status badge for completed transactions", async () => {
    const mockTx = [{
      id: "tx1",
      listingTitle: "Test Item",
      status: "completed",
      type: "sale",
      sellerId: "seller123",
      sellerName: "Test Seller",
      price: 100,
      createdAt: { toDate: () => new Date() },
    }];

    await renderComponent();
    setAuthenticatedUser();
    setMockTransactions(mockTx);
    
    await waitFor(() => {
      expect(screen.getByText("Completed")).toBeInTheDocument();
    });
  });

  test("shows Declined status badge for declined transactions", async () => {
    const mockTx = [{
      id: "tx1",
      listingTitle: "Test Item",
      status: "declined",
      type: "sale",
      sellerId: "seller123",
      sellerName: "Test Seller",
      price: 100,
      createdAt: { toDate: () => new Date() },
    }];

    await renderComponent();
    setAuthenticatedUser();
    setMockTransactions(mockTx);
    
    await waitFor(() => {
      expect(screen.getByText("Declined")).toBeInTheDocument();
    });
  });

  // ── Filter Tests ──────────────────────────────
  test("filtering by Pending shows only pending transactions", async () => {
    const mockTxs = [
      { id: "tx1", listingTitle: "Pending Item", status: "pending", type: "sale", sellerId: "s1", sellerName: "Seller 1", price: 100, createdAt: { toDate: () => new Date() } },
      { id: "tx2", listingTitle: "Accepted Item", status: "accepted", type: "sale", sellerId: "s2", sellerName: "Seller 2", price: 200, createdAt: { toDate: () => new Date() } },
    ];

    await renderComponent();
    setAuthenticatedUser();
    setMockTransactions(mockTxs);
    
    await waitFor(() => {
      expect(screen.getByText("Pending Item")).toBeInTheDocument();
      expect(screen.getByText("Accepted Item")).toBeInTheDocument();
    });
    
    fireEvent.click(screen.getByText("Pending"));
    
    await waitFor(() => {
      expect(screen.getByText("Pending Item")).toBeInTheDocument();
      expect(screen.queryByText("Accepted Item")).not.toBeInTheDocument();
    });
  });

  test("filtering by All shows all transactions", async () => {
    const mockTxs = [
      { id: "tx1", listingTitle: "Pending Item", status: "pending", type: "sale", sellerId: "s1", sellerName: "Seller 1", price: 100, createdAt: { toDate: () => new Date() } },
      { id: "tx2", listingTitle: "Accepted Item", status: "accepted", type: "sale", sellerId: "s2", sellerName: "Seller 2", price: 200, createdAt: { toDate: () => new Date() } },
    ];

    await renderComponent();
    setAuthenticatedUser();
    setMockTransactions(mockTxs);
    
    await waitFor(() => {
      expect(screen.getByText("Pending Item")).toBeInTheDocument();
      expect(screen.getByText("Accepted Item")).toBeInTheDocument();
    });
    
    fireEvent.click(screen.getByText("Pending"));
    fireEvent.click(screen.getByText("All"));
    
    await waitFor(() => {
      expect(screen.getByText("Pending Item")).toBeInTheDocument();
      expect(screen.getByText("Accepted Item")).toBeInTheDocument();
    });
  });

  // ── Auth Tests ────────────────────────────────
  test("redirects to /login when unauthenticated", async () => {
    await renderComponent();
    setUnauthenticated();
    
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/login");
    });
  });

  test("does not redirect when authenticated", async () => {
    await renderComponent();
    setAuthenticatedUser();
    setMockTransactions([]);
    
    await waitFor(() => {
      expect(screen.getByTestId("mock-navbar")).toBeInTheDocument();
    });
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
      sellerId: "seller123",
      sellerName: "Test Seller",
      price: 100,
      createdAt: { toDate: () => new Date() },
    }];

    await renderComponent();
    setAuthenticatedUser();
    setMockTransactions(mockTx);
    
    await waitFor(() => {
      const paymentButton = document.querySelector(`.${"viewBtnPay"}`);
      expect(paymentButton).toBeInTheDocument();
    });
  });

  test("payment button navigates to payment page", async () => {
    const mockTx = [{
      id: "tx1",
      listingTitle: "Test Item",
      status: "accepted",
      type: "sale",
      sellerId: "seller123",
      sellerName: "Test Seller",
      price: 100,
      createdAt: { toDate: () => new Date() },
    }];

    await renderComponent();
    setAuthenticatedUser();
    setMockTransactions(mockTx);
    
    await waitFor(() => {
      const paymentButton = document.querySelector(`.${"viewBtnPay"}`);
      expect(paymentButton).toBeInTheDocument();
      fireEvent.click(paymentButton);
      expect(mockNavigate).toHaveBeenCalledWith("/payment/tx1");
    });
  });

  // ── Status Message Tests ──────────────────────
  test("shows waiting message for pending seller response", async () => {
    const mockTx = [{
      id: "tx1",
      listingTitle: "Test Item",
      status: "pending",
      type: "sale",
      sellerId: "seller123",
      sellerName: "Test Seller",
      price: 100,
      createdAt: { toDate: () => new Date() },
    }];

    await renderComponent();
    setAuthenticatedUser();
    setMockTransactions(mockTx);
    
    await waitFor(() => {
      expect(screen.getByText(/Waiting for the seller to respond/i)).toBeInTheDocument();
    });
  });

  test("shows acceptance message for accepted offers", async () => {
    const mockTx = [{
      id: "tx1",
      listingTitle: "Test Item",
      status: "accepted",
      type: "sale",
      sellerId: "seller123",
      sellerName: "Test Seller",
      price: 100,
      createdAt: { toDate: () => new Date() },
    }];

    await renderComponent();
    setAuthenticatedUser();
    setMockTransactions(mockTx);
    
    await waitFor(() => {
      expect(screen.getByText(/Your offer was accepted/i)).toBeInTheDocument();
    });
  });
});
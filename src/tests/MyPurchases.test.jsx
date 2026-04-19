import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { vi, describe, test, beforeEach } from "vitest";
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
let authStateCallback = null;
let snapshotCallback = null;
const mockUnsubscribe = vi.fn();

vi.mock("../firebase", () => ({ auth: {}, db: {} }));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn((auth, cb) => {
    authStateCallback = cb;
    return () => {};
  }),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
  onSnapshot: vi.fn((query, cb) => {
    snapshotCallback = cb;
    return mockUnsubscribe;
  }),
}));

vi.mock("../components/NavBarTemp", () => ({
  default: () => <div data-testid="mock-navbar">NavBar Mock</div>,
}));

vi.mock("../components/MyPurchases.module.css", () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}));

// ── helper ─────────────────────────────────────
const renderMyPurchases = async () => {
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

// ── tests ──────────────────────────────────────
describe("MyPurchases Component - Basic Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;
    snapshotCallback = null;
    mockNavigate.mockClear();
    mockNavigateBack.mockClear();
  });

  test("shows filter buttons when authenticated", async () => {
    if (authStateCallback) {
      act(() => {
        authStateCallback({ uid: "123", email: "user@test.com" });
      });
    }
    
    if (snapshotCallback) {
      act(() => {
        snapshotCallback({ docs: [] });
      });
    }
    
    await renderMyPurchases();
    
    await waitFor(() => {
      expect(screen.getByText("All")).toBeInTheDocument();
      expect(screen.getByText("Pending")).toBeInTheDocument();
      expect(screen.getByText("Accepted")).toBeInTheDocument();
      expect(screen.getByText("Completed")).toBeInTheDocument();
      expect(screen.getByText("Declined")).toBeInTheDocument();
    });
  });

  test("filter buttons are clickable", async () => {
    if (authStateCallback) {
      act(() => {
        authStateCallback({ uid: "123", email: "user@test.com" });
      });
    }
    
    if (snapshotCallback) {
      act(() => {
        snapshotCallback({ docs: [] });
      });
    }
    
    await renderMyPurchases();
    
    await waitFor(() => {
      expect(screen.getByText("Pending")).toBeInTheDocument();
    });
    
    const pendingFilter = screen.getByText("Pending");
    fireEvent.click(pendingFilter);
    expect(pendingFilter).toHaveClass("filterBtnActive");
  });

  test("navigates back when back button clicked", async () => {
    if (authStateCallback) {
      act(() => {
        authStateCallback({ uid: "123", email: "user@test.com" });
      });
    }
    
    await renderMyPurchases();
    
    const backButton = await screen.findByText("Back");
    fireEvent.click(backButton);
    expect(mockNavigateBack).toHaveBeenCalled();
  });

  test("displays header title", async () => {
    if (authStateCallback) {
      act(() => {
        authStateCallback({ uid: "123", email: "user@test.com" });
      });
    }
    
    await renderMyPurchases();
    
    expect(screen.getByText("My Purchases & Offers")).toBeInTheDocument();
  });

  test("displays NavBar component", async () => {
    if (authStateCallback) {
      act(() => {
        authStateCallback({ uid: "123", email: "user@test.com" });
      });
    }
    
    await renderMyPurchases();
    
    expect(screen.getByTestId("mock-navbar")).toBeInTheDocument();
  });

  test("shows empty state message when no transactions", async () => {
    if (authStateCallback) {
      act(() => {
        authStateCallback({ uid: "123", email: "user@test.com" });
      });
    }
    
    if (snapshotCallback) {
      act(() => {
        snapshotCallback({ docs: [] });
      });
    }
    
    await renderMyPurchases();
    
    await waitFor(() => {
      expect(screen.getByText("You haven't made any offers yet")).toBeInTheDocument();
    });
  });

  test("displays browse listings button in empty state", async () => {
    if (authStateCallback) {
      act(() => {
        authStateCallback({ uid: "123", email: "user@test.com" });
      });
    }
    
    if (snapshotCallback) {
      act(() => {
        snapshotCallback({ docs: [] });
      });
    }
    
    await renderMyPurchases();
    
    await waitFor(() => {
      const browseBtn = screen.getByText("Browse Listings");
      expect(browseBtn).toBeInTheDocument();
    });
  });

  test("navigates to browse listings when button clicked", async () => {
    if (authStateCallback) {
      act(() => {
        authStateCallback({ uid: "123", email: "user@test.com" });
      });
    }
    
    if (snapshotCallback) {
      act(() => {
        snapshotCallback({ docs: [] });
      });
    }
    
    await renderMyPurchases();
    
    await waitFor(() => {
      const browseBtn = screen.getByText("Browse Listings");
      fireEvent.click(browseBtn);
      expect(mockNavigate).toHaveBeenCalledWith("/view-listing");
    });
  });

  test("filter count badges are not shown when no transactions", async () => {
    if (authStateCallback) {
      act(() => {
        authStateCallback({ uid: "123", email: "user@test.com" });
      });
    }
    
    if (snapshotCallback) {
      act(() => {
        snapshotCallback({ docs: [] });
      });
    }
    
    await renderMyPurchases();
    
    await waitFor(() => {
      expect(screen.getByText("All")).toBeInTheDocument();
      expect(screen.queryByText("1")).not.toBeInTheDocument();
    });
  });

  test("active count badge not shown when no active transactions", async () => {
    if (authStateCallback) {
      act(() => {
        authStateCallback({ uid: "123", email: "user@test.com" });
      });
    }
    
    if (snapshotCallback) {
      act(() => {
        snapshotCallback({ docs: [] });
      });
    }
    
    await renderMyPurchases();
    
    await waitFor(() => {
      expect(screen.queryByText(/active/)).not.toBeInTheDocument();
    });
  });

  test("component has correct CSS classes", async () => {
    if (authStateCallback) {
      act(() => {
        authStateCallback({ uid: "123", email: "user@test.com" });
      });
    }
    
    await renderMyPurchases();
    
    await waitFor(() => {
      const pageDiv = document.querySelector('.page');
      const containerDiv = document.querySelector('.container');
      const headerDiv = document.querySelector('.header');
      
      expect(pageDiv).toBeInTheDocument();
      expect(containerDiv).toBeInTheDocument();
      expect(headerDiv).toBeInTheDocument();
    });
  });

  test("filters section has correct structure", async () => {
    if (authStateCallback) {
      act(() => {
        authStateCallback({ uid: "123", email: "user@test.com" });
      });
    }
    
    await renderMyPurchases();
    
    await waitFor(() => {
      const filtersDiv = document.querySelector('.filters');
      expect(filtersDiv).toBeInTheDocument();
      expect(filtersDiv.children.length).toBe(5);
    });
  });

  test("back button has correct icon", async () => {
    if (authStateCallback) {
      act(() => {
        authStateCallback({ uid: "123", email: "user@test.com" });
      });
    }
    
    await renderMyPurchases();
    
    const backButton = await screen.findByText("Back");
    expect(backButton).toBeInTheDocument();
    const icon = backButton.querySelector('i');
    expect(icon).toHaveClass('fa-arrow-left');
  });

  test("empty state has correct icon", async () => {
    if (authStateCallback) {
      act(() => {
        authStateCallback({ uid: "123", email: "user@test.com" });
      });
    }
    
    if (snapshotCallback) {
      act(() => {
        snapshotCallback({ docs: [] });
      });
    }
    
    await renderMyPurchases();
    
    await waitFor(() => {
      const emptyStateDiv = document.querySelector('.emptyState');
      expect(emptyStateDiv).toBeInTheDocument();
      const icon = emptyStateDiv.querySelector('i');
      expect(icon).toHaveClass('fa-shopping-bag');
    });
  });
});
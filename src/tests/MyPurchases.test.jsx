import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { vi, describe, test, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import MyPurchases from "../components/MyPurchases";
import { onAuthStateChanged } from "firebase/auth";
import { onSnapshot, getDoc } from "firebase/firestore";

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
const mockUnsubscribe = vi.fn();

vi.mock("../firebase", () => ({ auth: {}, db: {} }));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock("../components/NavBarTemp", () => ({
  default: () => <div data-testid="mock-navbar">NavBar Mock</div>,
}));

vi.mock("../components/MyPurchases.module.css", () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}));

// ── Default mock implementations ────────────────
const applyDefaultMocks = () => {
  // Fire auth callback immediately with an authenticated user
  onAuthStateChanged.mockImplementation((auth, cb) => {
    cb({ uid: "123", email: "user@test.com" });
    return () => {};
  });

  // Fire snapshot callback immediately with empty docs so the component
  // exits the loading skeleton and renders the empty state
  onSnapshot.mockImplementation((query, cb) => {
    cb({ docs: [] });
    return mockUnsubscribe;
  });

  getDoc.mockResolvedValue({ exists: () => false });
};

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
    mockNavigate.mockClear();
    mockNavigateBack.mockClear();
    applyDefaultMocks();
  });

  test("shows filter buttons when authenticated", async () => {
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
    await renderMyPurchases();

    await waitFor(() => {
      expect(screen.getByText("Pending")).toBeInTheDocument();
    });

    const pendingFilter = screen.getByText("Pending");
    fireEvent.click(pendingFilter);
    expect(pendingFilter).toHaveClass("filterBtnActive");
  });

  test("navigates back when back button clicked", async () => {
    await renderMyPurchases();

    const backButton = await screen.findByText("Back");
    fireEvent.click(backButton);
    expect(mockNavigateBack).toHaveBeenCalled();
  });

  test("displays header title", async () => {
    await renderMyPurchases();

    expect(screen.getByText("My Purchases & Offers")).toBeInTheDocument();
  });

  test("displays NavBar component", async () => {
    await renderMyPurchases();

    expect(screen.getByTestId("mock-navbar")).toBeInTheDocument();
  });

  test("shows empty state message when no transactions", async () => {
    await renderMyPurchases();

    await waitFor(() => {
      expect(screen.getByText("You haven't made any offers yet")).toBeInTheDocument();
    });
  });

  test("displays browse listings button in empty state", async () => {
    await renderMyPurchases();

    await waitFor(() => {
      expect(screen.getByText("Browse Listings")).toBeInTheDocument();
    });
  });

  test("navigates to browse listings when button clicked", async () => {
    await renderMyPurchases();

    await waitFor(() => {
      expect(screen.getByText("Browse Listings")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Browse Listings"));
    expect(mockNavigate).toHaveBeenCalledWith("/view-listing");
  });

  test("filter count badges are not shown when no transactions", async () => {
    await renderMyPurchases();

    await waitFor(() => {
      expect(screen.getByText("All")).toBeInTheDocument();
      expect(screen.queryByText("1")).not.toBeInTheDocument();
    });
  });

  test("active count badge not shown when no active transactions", async () => {
    await renderMyPurchases();

    await waitFor(() => {
      expect(screen.queryByText(/active/)).not.toBeInTheDocument();
    });
  });

  test("component has correct CSS classes", async () => {
    await renderMyPurchases();

    await waitFor(() => {
      expect(document.querySelector('.page')).toBeInTheDocument();
      expect(document.querySelector('.container')).toBeInTheDocument();
      expect(document.querySelector('.header')).toBeInTheDocument();
    });
  });

  test("filters section has correct structure", async () => {
    await renderMyPurchases();

    await waitFor(() => {
      const filtersDiv = document.querySelector('.filters');
      expect(filtersDiv).toBeInTheDocument();
      // FILTERS array: all, pending, accepted, waiting, completed, declined = 6
      expect(filtersDiv.children.length).toBe(6);
    });
  });

  test("back button has correct icon", async () => {
    await renderMyPurchases();

    const backButton = await screen.findByText("Back");
    expect(backButton).toBeInTheDocument();
    const icon = backButton.querySelector('i');
    expect(icon).toHaveClass('fa-arrow-left');
  });

  test("empty state has correct icon", async () => {
    await renderMyPurchases();

    await waitFor(() => {
      const emptyStateDiv = document.querySelector('.emptyState');
      expect(emptyStateDiv).toBeInTheDocument();
      const icon = emptyStateDiv.querySelector('i');
      expect(icon).toHaveClass('fa-shopping-bag');
    });
  });
});
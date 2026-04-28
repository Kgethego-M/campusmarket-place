import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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
// Use module-scope wrapper fns so vi.clearAllMocks() only resets call counts,
// not the implementations (which live on our local vi.fn() references).
const mockUnsubscribe = vi.fn();
const mockOnSnapshot = vi.fn();
const mockOnAuthStateChanged = vi.fn();
const mockGetDoc = vi.fn();

vi.mock("../firebase", () => ({ auth: {}, db: {} }));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (...args) => mockOnAuthStateChanged(...args),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  doc: vi.fn(),
  getDoc: (...args) => mockGetDoc(...args),
  onSnapshot: (...args) => mockOnSnapshot(...args),
}));

vi.mock("../components/NavBarTemp", () => ({
  default: () => <div data-testid="mock-navbar">NavBar Mock</div>,
}));

vi.mock("../components/MyPurchases.module.css", () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}));

// ── Default mock implementations ────────────────
const setupDefaultMocks = () => {
  // Auth fires immediately with an authenticated user
  mockOnAuthStateChanged.mockImplementation((auth, cb) => {
    cb({ uid: "123", email: "user@test.com" });
    return () => {};
  });

  // onSnapshot fires cb with empty docs AND stores the callback so
  // we can manually re-fire it after timers advance if needed.
  // Critically: we do NOT fire cb here synchronously, because doing so
  // sets transactions=[] but doesn't change it from its initial [],
  // meaning the [transactions] effect dep never sees a change and the
  // component stays stuck in loading=true even after snapshotReceived=true.
  // Instead we let the component's own 50ms fallback timer flip
  // snapshotReceived=true, which we trigger by advancing fake timers.
  mockOnSnapshot.mockImplementation((_query, cb) => {
    // Fire synchronously so transactions=[] and snapshotReceived=true both set
    // in the same flush. React batches these together, so [transactions] effect
    // WILL see transactions change (from uninitialised to []) and re-run.
    cb({ docs: [] });
    return mockUnsubscribe;
  });

  mockGetDoc.mockResolvedValue({ exists: () => false });
};

// ── Render helper ───────────────────────────────
// Uses fake timers to ensure the component's 50ms fallback setTimeout
// (which sets snapshotReceived=true as a safety net) always fires,
// guaranteeing the enrich effect runs and loading becomes false.
const renderMyPurchases = async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  let result;

  await act(async () => {
    result = render(
      <MemoryRouter>
        <MyPurchases />
      </MemoryRouter>
    );
    // Advance past the component's 50ms fallback timer
    await vi.advanceTimersByTimeAsync(100);
  });

  vi.useRealTimers();
  return result;
};

// ── Tests ───────────────────────────────────────
describe("MyPurchases Component - Basic Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    mockNavigateBack.mockClear();
    setupDefaultMocks();
  });

  afterEach(() => {
    // Always restore real timers in case a test fails mid-fake-timer usage
    vi.useRealTimers();
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
      expect(
        screen.getByText("You haven't made any offers yet")
      ).toBeInTheDocument();
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
      expect(document.querySelector(".page")).toBeInTheDocument();
      expect(document.querySelector(".container")).toBeInTheDocument();
      expect(document.querySelector(".header")).toBeInTheDocument();
    });
  });

  test("filters section has correct structure", async () => {
    await renderMyPurchases();

    await waitFor(() => {
      const filtersDiv = document.querySelector(".filters");
      expect(filtersDiv).toBeInTheDocument();
      // FILTERS array: all, pending, accepted, waiting, completed, declined = 6
      expect(filtersDiv.children.length).toBe(6);
    });
  });

  test("back button has correct icon", async () => {
    await renderMyPurchases();

    const backButton = await screen.findByText("Back");
    expect(backButton).toBeInTheDocument();
    const icon = backButton.querySelector("i");
    expect(icon).toHaveClass("fa-arrow-left");
  });

  test("empty state has correct icon", async () => {
    await renderMyPurchases();

    await waitFor(() => {
      const emptyStateDiv = document.querySelector(".emptyState");
      expect(emptyStateDiv).toBeInTheDocument();
      const icon = emptyStateDiv.querySelector("i");
      expect(icon).toHaveClass("fa-shopping-bag");
    });
  });
});
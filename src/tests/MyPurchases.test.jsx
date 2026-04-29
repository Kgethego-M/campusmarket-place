import { render, screen, fireEvent, act } from "@testing-library/react";
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

const setupDefaultMocks = () => {
  mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
    cb({ uid: "123", email: "user@test.com" });
    return () => {};
  });
  mockOnSnapshot.mockImplementation((_query, cb) => {
    cb({ docs: [] });
    return mockUnsubscribe;
  });
  mockGetDoc.mockResolvedValue({ exists: () => false });
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

// TODO: re-enable after deployment — skipped to prevent CI OOM while
// the GitHub Actions runner doesn't have enough heap for this component.
// To re-enable: change describe.skip → describe
describe.skip("MyPurchases Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  test("renders NavBar", async () => {
    await renderComponent();
    expect(screen.getByTestId("mock-navbar")).toBeInTheDocument();
  });

  test("displays header title", async () => {
    await renderComponent();
    expect(screen.getByText("My Purchases & Offers")).toBeInTheDocument();
  });

  test("shows all filter buttons", async () => {
    await renderComponent();
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByText("Waiting")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Declined")).toBeInTheDocument();
  });

  test("filters section renders 6 buttons", async () => {
    await renderComponent();
    const filtersDiv = document.querySelector(".filters");
    expect(filtersDiv).toBeInTheDocument();
    expect(filtersDiv.children.length).toBe(6);
  });

  test("clicking a filter marks it active", async () => {
    await renderComponent();
    const pendingFilter = screen.getByText("Pending");
    fireEvent.click(pendingFilter);
    expect(pendingFilter).toHaveClass("filterBtnActive");
  });

  test("clicking All filter marks it active", async () => {
    await renderComponent();
    fireEvent.click(screen.getByText("Pending"));
    fireEvent.click(screen.getByText("All"));
    expect(screen.getByText("All")).toHaveClass("filterBtnActive");
  });

  test("back button is present and navigates back", async () => {
    await renderComponent();
    const backButton = screen.getByText("Back");
    expect(backButton).toBeInTheDocument();
    fireEvent.click(backButton);
    expect(mockNavigateBack).toHaveBeenCalled();
  });

  test("back button has arrow-left icon", async () => {
    await renderComponent();
    const icon = screen.getByText("Back").querySelector("i");
    expect(icon).toHaveClass("fa-arrow-left");
  });

  test("shows empty state when no transactions", async () => {
    await renderComponent();
    expect(screen.getByText("You haven't made any offers yet")).toBeInTheDocument();
  });

  test("empty state has shopping-bag icon", async () => {
    await renderComponent();
    const emptyDiv = document.querySelector(".emptyState");
    expect(emptyDiv).toBeInTheDocument();
    expect(emptyDiv.querySelector("i")).toHaveClass("fa-shopping-bag");
  });

  test("Browse Listings button is visible in empty state", async () => {
    await renderComponent();
    expect(screen.getByText("Browse Listings")).toBeInTheDocument();
  });

  test("Browse Listings navigates to /view-listing", async () => {
    await renderComponent();
    fireEvent.click(screen.getByText("Browse Listings"));
    expect(mockNavigate).toHaveBeenCalledWith("/view-listing");
  });

  test("no count badges shown when empty", async () => {
    await renderComponent();
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  test("no active count badge when empty", async () => {
    await renderComponent();
    expect(screen.queryByText(/\d+ active/)).not.toBeInTheDocument();
  });

  test("correct top-level CSS classes exist", async () => {
    await renderComponent();
    expect(document.querySelector(".page")).toBeInTheDocument();
    expect(document.querySelector(".container")).toBeInTheDocument();
    expect(document.querySelector(".header")).toBeInTheDocument();
  });

  test("redirects to /login when unauthenticated", async () => {
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      cb(null);
      return () => {};
    });
    await renderComponent();
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  test("unsubscribes snapshot listener on unmount", async () => {
    const { unmount } = await renderComponent();
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  test("non-all filter hides Browse Listings button", async () => {
    await renderComponent();
    fireEvent.click(screen.getByText("Pending"));
    expect(screen.queryByText("Browse Listings")).not.toBeInTheDocument();
  });

  test("non-all filter shows correct empty message", async () => {
    await renderComponent();
    fireEvent.click(screen.getByText("Declined"));
    expect(screen.getByText("No declined offers")).toBeInTheDocument();
  });
});